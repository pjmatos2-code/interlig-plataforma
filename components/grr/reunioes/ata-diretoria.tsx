import { cn } from "@/lib/utils";
import { indicadorPorChave } from "@/lib/grr/catalogo";
import { tabelaDeIndicadores, textoAtingimento } from "@/lib/grr/painel";
import { ROTULO_APROVACAO_PLANO, situacaoExibida, ROTULO_SITUACAO_PLANO, type Plano } from "@/lib/grr/planos";
import { PAUTA_DIRETORIA, type ItemPauta } from "@/lib/grr/reunioes";
import type { FotoReuniaoDiretoria } from "@/lib/grr/reunioes-dados";
import { ROTULO_STATUS } from "@/components/grr/painel/icones";
import { paraPainel } from "@/lib/grr/painel";
import { ROTULO_STATUS_ROTINA } from "@/lib/grr/rotinas";

/**
 * Ata da reunião de resultados (Etapa 4): os cinco itens da pauta, na ordem
 * da especificação. Serve à página da reunião (com os formulários encaixados
 * em cada item, quando aberta) e à página de impressão do PDF.
 */

const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const COR_STATUS = { ok: "text-green-700", atencao: "text-amber-700", critico: "text-red-700", sem_meta: "text-slate-500" } as const;

function Item({ n, titulo, nota, children, slot }: { n: number; titulo: string; nota?: string; children: React.ReactNode; slot?: React.ReactNode }) {
  return (
    <section className="ata-item break-inside-avoid-page rounded-2xl border bg-card p-4 shadow-sm print:rounded-none print:border-0 print:border-t print:p-0 print:pt-4 print:shadow-none" aria-label={titulo}>
      <h2 className="flex items-baseline gap-2 text-base font-semibold tracking-tight">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-interlig-azul text-xs font-bold text-white">{n}</span>
        {titulo}
      </h2>
      <div className="mt-3 space-y-3 text-sm">{children}</div>
      {nota && (
        <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-sm print:bg-slate-50">
          <p className="text-xs font-medium text-muted-foreground">Anotações da reunião</p>
          <p className="whitespace-pre-line">{nota}</p>
        </div>
      )}
      {slot && <div className="mt-3 print:hidden">{slot}</div>}
    </section>
  );
}

function ListaPlanos({ planos, hoje, vazio }: { planos: Plano[]; hoje: string; vazio: string }) {
  if (!planos.length) return <p className="text-muted-foreground">{vazio}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          <th className="py-1.5 font-medium">Ação</th>
          <th className="font-medium">Recorte</th>
          <th className="font-medium">Responsável</th>
          <th className="font-medium">Prazo</th>
          <th className="font-medium">Situação</th>
        </tr>
      </thead>
      <tbody>
        {planos.map((p) => (
          <tr key={p.id} className="border-b align-top last:border-0">
            <td className="py-1.5 pr-2">
              {p.descricao}
              <span className="block text-xs text-muted-foreground">{p.indicador ? indicadorPorChave(p.indicador)?.nome : p.problema}</span>
            </td>
            <td className="pr-2">{p.escopo_rotulo}</td>
            <td className="pr-2">{p.responsavel_nome}</td>
            <td className="whitespace-nowrap pr-2">{dataBr(p.prazo) || "—"}</td>
            <td className={cn("whitespace-nowrap", situacaoExibida(p, hoje) === "atrasada" && "font-semibold text-red-700")}>
              {p.aprovacao === "aprovado" ? ROTULO_SITUACAO_PLANO[situacaoExibida(p, hoje)] : ROTULO_APROVACAO_PLANO[p.aprovacao]}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AtaDiretoria({
  foto,
  reuniaoId,
  hoje,
  slots = {},
}: {
  foto: FotoReuniaoDiretoria;
  reuniaoId: string;
  hoje: string;
  /** formulários de cada item, quando a reunião está aberta */
  slots?: Partial<Record<ItemPauta, React.ReactNode>>;
}) {
  const dados = foto.indicadores;
  const grupos = tabelaDeIndicadores(dados).filter((g) => g.linhas.length);
  const desvios = dados.cartoes.filter((c) => c.status === "atencao" || c.status === "critico").map((c) => paraPainel(c, dados));
  const emExecucao = foto.planos.filter((p) => p.aprovacao === "aprovado" && p.reuniao_id !== reuniaoId && p.situacao !== "cancelada");
  const novas = foto.planos.filter((p) => p.aprovacao === "aguardando" || p.reuniao_id === reuniaoId);
  const n = (i: number) => PAUTA_DIRETORIA[i];

  return (
    <div className="space-y-4">
      <Item n={1} titulo={n(0).titulo} nota={foto.ata.pauta.indicadores} slot={slots.indicadores}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-1.5 font-medium">Indicador</th>
              <th className="text-right font-medium">Resultado</th>
              <th className="text-right font-medium">Meta</th>
              <th className="text-right font-medium">Atingimento</th>
              <th className="text-right font-medium">Situação</th>
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.grupo}>
              <tr>
                <td colSpan={5} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.titulo}
                </td>
              </tr>
              {g.linhas.map((c) => (
                <tr key={c.chave} className="border-b last:border-0">
                  <td className="py-1.5">{c.rotulo}</td>
                  <td className="text-right font-semibold tabular-nums">{c.valor}</td>
                  <td className="text-right tabular-nums text-muted-foreground">{c.meta ? c.meta.replace(/^meta /, "") : "—"}</td>
                  <td className="text-right tabular-nums">{textoAtingimento(c.atingimento)}</td>
                  <td className={cn("text-right font-medium", COR_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Item>

      <Item n={2} titulo={n(1).titulo} nota={foto.ata.pauta.diagnosticos} slot={slots.diagnosticos}>
        {desvios.length === 0 ? (
          <p className="text-muted-foreground">Nenhum indicador em atenção ou crítico.</p>
        ) : (
          desvios.map((c) => {
            const diags = foto.diagnosticos.filter((d) => d.indicador === c.chave);
            return (
              <div key={c.chave} className="break-inside-avoid rounded-xl border px-3 py-2">
                <p className="font-semibold">
                  {c.rotulo}: {c.valor}
                  {c.meta ? ` (${c.meta})` : ""} <span className={cn("ml-1 text-xs font-medium", COR_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
                </p>
                {diags.length === 0 ? (
                  <p className="text-amber-800">Sem diagnóstico registrado.</p>
                ) : (
                  diags.map((d) => (
                    <div key={d.id} className="mt-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.escopo_rotulo}</p>
                      <p><b>Causa:</b> {d.causa}</p>
                      <p><b>Evidências:</b> {d.evidencias || "sem evidência (hipótese)"}</p>
                      {d.providencias && <p><b>Providências:</b> {d.providencias}</p>}
                      {d.solucao && <p><b>Solução proposta:</b> {d.solucao}</p>}
                    </div>
                  ))
                )}
              </div>
            );
          })
        )}
      </Item>

      <Item n={3} titulo={n(2).titulo} nota={foto.ata.pauta.acompanhamento} slot={slots.acompanhamento}>
        <ListaPlanos planos={emExecucao} hoje={hoje} vazio="Nenhum plano aprovado anteriormente." />
        {foto.rotinas && foto.rotinas.length > 0 && (
          <div className="break-inside-avoid">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rotinas das lideranças na semana</p>
            <ul className="space-y-1">
              {foto.rotinas.map((l) => (
                <li key={l.liderId}>
                  <b>{l.nome}</b>: {l.avaliados ? `${l.cumpridos} de ${l.avaliados} cumpridos` : "nada a avaliar"}
                  {l.itens.filter((i) => i.status === "nao_cumprido" || i.status === "parcial").length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {l.itens
                        .filter((i) => i.status === "nao_cumprido" || i.status === "parcial")
                        .map((i) => `${i.titulo} (${ROTULO_STATUS_ROTINA[i.status].toLowerCase()})`)
                        .join("; ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Item>

      <Item n={4} titulo={n(3).titulo} nota={foto.ata.pauta.novas_acoes} slot={slots.novas_acoes}>
        <ListaPlanos planos={novas} hoje={hoje} vazio="Nenhuma ação nova proposta." />
      </Item>

      <Item n={5} titulo={n(4).titulo} nota={foto.ata.pauta.decisoes} slot={slots.decisoes}>
        {foto.ata.decisoes.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma decisão registrada.</p>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5">
            {foto.ata.decisoes.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.texto}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.responsavel || "sem responsável"} · {d.prazo ? `até ${dataBr(d.prazo)}` : "sem prazo"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Item>
    </div>
  );
}
