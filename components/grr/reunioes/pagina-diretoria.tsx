import Link from "next/link";
import { FileDown, Lock, Presentation } from "lucide-react";
import { AreasGrr } from "@/components/grr/areas";
import { FormAprovacaoPlano } from "@/components/grr/planos/formularios";
import { cn } from "@/lib/utils";
import type { Perfil } from "@/lib/tipos";
import { desviosSemDiagnostico } from "@/lib/grr/planos";
import { PAUTA_DIRETORIA, type ReuniaoGrr } from "@/lib/grr/reunioes";
import { participantesPossiveisDiretoria, pautaDaReuniao, type Registro } from "@/lib/grr/reunioes-dados";
import { dataBr, hojeSantarem, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { AtaDiretoria } from "./ata-diretoria";
import { FormCorrecaoDiretoria, FormDecisao, FormEncerrarDiretoria, FormNotaPauta, FormParticipantesDiretoria, ListaDecisoesEditavel } from "./diretoria-forms";

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} às ${d.slice(11, 16)}`;
};

/** Reunião de resultados da diretoria: preparação, pauta, decisões, encerramento e relatório */
export async function PaginaReuniaoDiretoria({ r, registros, usuario }: { r: ReuniaoGrr; registros: Registro[]; usuario: { id: string; perfil: Perfil } }) {
  const hoje = hojeSantarem();
  const aberta = r.situacao === "aberta";
  const diretoria = usuario.perfil === "gestor" || usuario.perfil === "direcao";
  const [pauta, possiveis] = await Promise.all([pautaDaReuniao(r, usuario.id), diretoria && aberta ? participantesPossiveisDiretoria() : Promise.resolve([])]);
  const semDiagnostico = desviosSemDiagnostico(pauta.indicadores.cartoes, pauta.diagnosticos).length;
  const aguardando = pauta.planos.filter((p) => p.aprovacao === "aguardando");
  const podeEditar = aberta && diretoria;
  const correcoes = registros.filter((x) => x.tipo === "correcao");

  const slots = podeEditar
    ? Object.fromEntries(
        PAUTA_DIRETORIA.map((item) => [
          item.chave,
          <div key={item.chave} className="space-y-3">
            {item.chave === "novas_acoes" && aguardando.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Decidir os planos aguardando a diretoria</p>
                {aguardando.map((p) => (
                  <div key={p.id} className="rounded-xl border bg-background p-3">
                    <p className="text-sm font-medium">{p.descricao}</p>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {p.escopo_rotulo} · {p.responsavel_nome}
                    </p>
                    <FormAprovacaoPlano id={p.id} compacto reuniaoId={r.id} />
                  </div>
                ))}
              </div>
            )}
            {item.chave === "decisoes" && (
              <>
                <FormDecisao id={r.id} />
                <ListaDecisoesEditavel id={r.id} decisoes={pauta.ata.decisoes} />
              </>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium text-interlig-azul">{pauta.ata.pauta[item.chave] ? "Editar anotações" : "Anotar"}</summary>
              <div className="mt-2">
                <FormNotaPauta id={r.id} item={item.chave} valor={pauta.ata.pauta[item.chave] ?? ""} />
              </div>
            </details>
          </div>,
        ])
      )
    : {};

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/grr/reunioes" className="text-interlig-azul hover:underline">
          ← Reuniões
        </Link>
      </p>
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Reunião de resultados · {r.escopo_rotulo}</h1>
          <p className="text-sm text-muted-foreground">
            {dataBr(r.data_reuniao)} · semana de {rotuloSemana({ inicio: r.periodo_inicio, fim: r.periodo_fim })} ·{" "}
            {pauta.fotoVersao != null ? `semana congelada (versão ${pauta.fotoVersao})` : "números de agora"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium", aberta ? "border-interlig-ceu/40 bg-interlig-ceu/10 text-interlig-azul" : "bg-muted text-muted-foreground")}>
            {!aberta && <Lock className="h-3.5 w-3.5" aria-hidden />}
            {aberta ? "Aberta" : `Encerrada em ${dataHora(r.encerrada_em!)}`}
          </span>
          <Link href={`/apresentacao/grr?reuniao=${r.id}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90">
            <Presentation className="h-4 w-4" aria-hidden /> Apresentar reunião
          </Link>
          {!aberta && (
            <a href={`/api/grr/reunioes/${r.id}/pdf`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium hover:border-interlig-ceu">
              <FileDown className="h-4 w-4 text-interlig-azul" aria-hidden /> Relatório (PDF)
            </a>
          )}
        </div>
      </header>
      <AreasGrr ativa="reunioes" parametros="" gestor={usuario.perfil === "gestor"} />

      {aberta && (
        <section className="mb-4 grid gap-2 sm:grid-cols-3" aria-label="Preparação">
          {[
            ["Semana", pauta.fotoVersao != null ? "Congelada" : r.periodo_fim < hoje ? "Ainda não congelada" : "Em andamento", pauta.fotoVersao != null],
            ["Desvios sem diagnóstico", String(semDiagnostico), semDiagnostico === 0],
            ["Planos aguardando a diretoria", String(aguardando.length), aguardando.length === 0],
          ].map(([t, v, ok]) => (
            <div key={String(t)} className={cn("rounded-xl border bg-card px-4 py-3", !ok && "border-farol-amarelo/50 bg-farol-amarelo/[0.06]")}>
              <p className="text-xs text-muted-foreground">{t}</p>
              <p className="text-lg font-semibold">{v}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mb-4 rounded-2xl border bg-card p-4 shadow-sm" aria-label="Participantes">
        <h2 className="mb-2 text-base font-semibold">Participantes</h2>
        {podeEditar ? (
          <FormParticipantesDiretoria id={r.id} data={r.data_reuniao} possiveis={possiveis} participantes={r.participantes} />
        ) : (
          <p className="text-sm">{r.participantes.length ? r.participantes.map((p) => p.nome).join(" · ") : "não registrados"}</p>
        )}
      </section>

      <AtaDiretoria foto={pauta} reuniaoId={r.id} hoje={hoje} slots={slots} />

      <section className="mt-4 rounded-2xl border bg-card p-4 shadow-sm" aria-label={aberta ? "Encerramento" : "Correções"}>
        <h2 className="mb-2 text-base font-semibold">{aberta ? "Encerramento" : "Correções"}</h2>
        {aberta ? (
          diretoria ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ao encerrar, a semana é congelada (se ainda não estiver) e a reunião guarda os números, os diagnósticos, os planos, os participantes e as decisões. Depois disso, só correções registradas à parte.
              </p>
              <FormEncerrarDiretoria id={r.id} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Só a diretoria encerra a reunião de resultados.</p>
          )
        ) : (
          <div className="space-y-3">
            {correcoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma correção registrada.</p>
            ) : (
              <ul className="space-y-2">
                {correcoes.map((x) => (
                  <li key={x.id} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    <p>{x.texto}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{dataHora(x.criado_em)}</p>
                  </li>
                ))}
              </ul>
            )}
            {diretoria && <FormCorrecaoDiretoria id={r.id} />}
          </div>
        )}
      </section>
    </div>
  );
}
