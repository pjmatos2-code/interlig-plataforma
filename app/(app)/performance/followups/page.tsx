import Link from "next/link";
import { AcoesFollowup, AcoesSugestao, AgendarRetorno } from "@/components/performance/acoes-followup";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtDataHora, fmtNum, fmtPct } from "@/components/performance/formato";
import { Kpi } from "@/components/performance/kpi";
import { Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { indexar } from "@/lib/performance/dados/calcular";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";
import { pontuarPrioridade } from "@/lib/performance/regras/followups";

export const dynamic = "force-dynamic";

const ABAS = [
  ["fila", "Fila de tarefas"],
  ["sugestoes", "Sugestões da IA"],
  ["sem_retorno", "Leads sem retorno"],
  ["historico", "Histórico"],
] as const;
const ROTULO_STATUS: Record<string, string> = {
  programado: "Programado",
  pendente: "Vence hoje",
  vencido: "Vencido",
  concluido_prazo: "Concluído no prazo",
  concluido_atraso: "Concluído com atraso",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
  sugerido: "Sugerido pela IA",
};
const ROTULO_ORIGEM: Record<string, string> = { crm: "CRM", manual: "Agendado aqui", ia: "IA", regra: "Regra", robo: "Robô do chat" };

export default async function FollowupsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const aba = (ABAS.find(([k]) => k === searchParams.aba)?.[0] ?? "fila") as (typeof ABAS)[number][0];
  const statusFiltro = typeof searchParams.status === "string" ? searchParams.status : null;
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const base = ap.base;
  const idx = indexar(base);
  const ids = new Set(ap.linhas.map((l) => l.vendedor.id));
  const nomeVendedor = new Map(base.vendedores.map((v) => [v.id, v.nome]));
  const ticket = new Map(base.tickets.map((t) => [t.id, t]));
  const doEscopo = base.followups.filter((f) => {
    const dono = f.vendedor_id ?? ticket.get(f.ticket_id)?.vendedor_id ?? null;
    return dono !== null && ids.has(dono);
  });
  const abertos = doEscopo
    .filter((f) => ["programado", "pendente", "vencido"].includes(f.status))
    .filter((f) => !statusFiltro || f.status === statusFiltro)
    .map((f) => {
      const t = ticket.get(f.ticket_id);
      const a = idx.analisePorTicket.get(f.ticket_id);
      const ultima = idx.ultimaAcao(f.ticket_id);
      const vencidoHoras = f.status === "vencido" ? (base.agoraMs - Date.parse(f.prazo)) / 3_600_000 : 0;
      return {
        f,
        t,
        prioridade: pontuarPrioridade({
          intencaoCompra: a?.intencao_compra ?? null,
          temperatura: (a?.temperatura as "quente" | "morno" | "frio" | "indeterminado" | null) ?? null,
          urgenciaAlta: t?.urgencia === "alta",
          horasSemInteracao: ultima ? (base.agoraMs - ultima) / 3_600_000 : null,
          vencidoHoras,
          etapa: t?.etapa ?? null,
          valorEstimado: t?.valor_estimado ?? null,
          prioridadeDeclarada: (f.prioridade as "alta" | "media" | "baixa") ?? "media",
        }),
      };
    })
    .sort((a, b) => b.prioridade - a.prioridade);
  const sugestoes = doEscopo.filter((f) => f.status === "sugerido");
  const historico = doEscopo
    .filter((f) => ["concluido_prazo", "concluido_atraso", "cancelado", "rejeitado"].includes(f.status))
    .sort((a, b) => Date.parse(b.concluido_em ?? b.prazo) - Date.parse(a.concluido_em ?? a.prazo))
    .slice(0, 100);
  const limite = base.cfg.sla.sem_retorno_horas * 3_600_000;
  const semRetorno = base.tickets
    .filter((t) => t.origem_criacao !== "sgp_auto" && t.etapa !== "fechado" && t.vendedor_id && ids.has(t.vendedor_id))
    .filter((t) => {
      const futuro = (t.followup_em && Date.parse(t.followup_em) > base.agoraMs) || doEscopo.some((f) => f.ticket_id === t.id && ["programado", "pendente"].includes(f.status) && Date.parse(f.prazo) > base.agoraMs);
      if (futuro) return false;
      return base.agoraMs - (idx.ultimaAcao(t.id) ?? Date.parse(t.criado_em)) > limite;
    })
    .sort((a, b) => (idx.ultimaAcao(a.id) ?? Date.parse(a.criado_em)) - (idx.ultimaAcao(b.id) ?? Date.parse(b.criado_em)));
  const execucao = ap.linhas.reduce((s, l) => ({ noPrazo: s.noPrazo + (l.esforco.indicadores.followups_prazo.numerador ?? 0), devidos: s.devidos + (l.esforco.indicadores.followups_prazo.denominador ?? 0) }), { noPrazo: 0, devidos: 0 });
  const qs = (m: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(m)) (v === null ? n.delete(k) : n.set(k, v));
    return `?${n.toString()}`;
  };
  const podeAgir = ctx.escopo.papel !== "diretoria";

  return (
    <div>
      {ctx.escopo.papel !== "vendedor" && (
        <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} vendedores={ctx.opcoes.vendedores} mostrar={{ pop: true, setor: true, coord: true, vendedor: true }} />
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi rotulo="Abertos" valor={fmtNum(doEscopo.filter((f) => ["programado", "pendente"].includes(f.status)).length)} contexto="programados e de hoje" />
        <Kpi rotulo="Vencidos" valor={fmtNum(doEscopo.filter((f) => f.status === "vencido").length)} tom={doEscopo.some((f) => f.status === "vencido") ? "vermelho" : undefined} />
        <Kpi rotulo="Execução no prazo" valor={execucao.devidos ? fmtPct(execucao.noPrazo / execucao.devidos) : "Sem dados"} contexto={`${execucao.noPrazo} de ${execucao.devidos} no período`} />
        <Kpi rotulo="Sugestões da IA" valor={fmtNum(sugestoes.length)} contexto="aguardando aceite" />
        <Kpi rotulo="Leads sem retorno" valor={fmtNum(semRetorno.length)} tom={semRetorno.length ? "amarelo" : undefined} contexto={`> ${base.cfg.sla.sem_retorno_horas} h sem ação`} />
      </div>

      <nav className="mt-4 flex flex-wrap gap-1 border-b" aria-label="Seções de follow-up">
        {ABAS.map(([k, r]) => (
          <Link key={k} href={qs({ aba: k, status: null })} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", aba === k ? "border-interlig-azul text-interlig-azul" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {r}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
        {aba === "fila" && (
          <Painel
            titulo="Fila inteligente"
            descricao="Ordem por intenção comercial, urgência, tempo sem interação, vencimento, etapa e valor. A probabilidade estimada é só desempate — nunca certeza. Concluir e reprogramar atualizam o CRM."
            acao={
              <div className="flex gap-1 text-xs">
                {[null, "vencido", "pendente", "programado"].map((st) => (
                  <Link key={st ?? "todos"} href={qs({ status: st })} className={cn("rounded-md border px-2 py-1", statusFiltro === st ? "border-interlig-azul bg-interlig-azul/10 text-interlig-azul" : "hover:bg-muted")}>
                    {st ? ROTULO_STATUS[st] : "Todos"}
                  </Link>
                ))}
              </div>
            }
          >
            {abertos.length === 0 ? (
              <Vazio>
                Nenhum follow-up aberto. Eles nascem quando alguém reagenda uma tratativa, agenda um retorno ou cria um lembrete no CRM — ou quando uma sugestão da IA é aceita.
                {base.followups.length === 0 && " O registro começou com a implantação deste módulo; não há histórico anterior."}
              </Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Prioridade</th>
                      <th className="py-2 font-medium">Lead</th>
                      <th className="py-2 font-medium">Vendedor</th>
                      <th className="py-2 font-medium">O que fazer</th>
                      <th className="py-2 font-medium">Prazo</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Origem</th>
                      {podeAgir && <th className="py-2 font-medium">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {abertos.map(({ f, t, prioridade }) => (
                      <tr key={f.id} className="border-t align-top">
                        <td className="py-2.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular-nums", prioridade >= 40 ? "bg-farol-vermelho/10 text-farol-vermelho" : prioridade >= 20 ? "bg-farol-amarelo/15 text-[hsl(38_92%_33%)]" : "bg-muted text-muted-foreground")}>{Math.round(prioridade)}</span>
                        </td>
                        <td className="py-2.5">
                          <Link href={`/crm/${f.ticket_id}`} className="font-medium text-interlig-azul hover:underline">{t?.cliente_nome ?? "Abrir lead"}</Link>
                        </td>
                        <td className="py-2.5 text-xs">{nomeVendedor.get(f.vendedor_id ?? t?.vendedor_id ?? "") ?? "—"}</td>
                        <td className="max-w-[16rem] py-2.5 text-xs">{f.proximo_passo ?? f.motivo ?? "Retorno ao cliente"}</td>
                        <td className="py-2.5 text-xs tabular-nums">{fmtDataHora(f.prazo)}</td>
                        <td className="py-2.5">
                          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", f.status === "vencido" ? "bg-farol-vermelho/10 text-farol-vermelho" : f.status === "pendente" ? "bg-farol-amarelo/15 text-[hsl(38_92%_33%)]" : "bg-muted")}>{ROTULO_STATUS[f.status] ?? f.status}</span>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{ROTULO_ORIGEM[f.origem] ?? f.origem}</td>
                        {podeAgir && (
                          <td className="py-2.5">
                            <AcoesFollowup id={f.id} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>
        )}

        {aba === "sugestoes" && (
          <Painel titulo="Sugestões de follow-up da IA" descricao="A IA sugere; quem decide é o vendedor. Aceitar agenda o retorno no CRM; antes de sugerir, a IA confere se já existe tarefa equivalente.">
            {sugestoes.length === 0 ? (
              <Vazio>{base.cfg.ia.habilitada ? "Nenhuma sugestão pendente." : "Análise por IA desligada — sem sugestões. Os follow-ups do CRM seguem normalmente."}</Vazio>
            ) : (
              <ul className="divide-y">
                {sugestoes.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/crm/${f.ticket_id}`} className="font-medium text-interlig-azul hover:underline">{ticket.get(f.ticket_id)?.cliente_nome ?? "Abrir lead"}</Link>
                      <p className="text-sm">{f.proximo_passo ?? f.motivo}</p>
                      <p className="text-xs text-muted-foreground">sugerido para {fmtDataHora(f.prazo)} · {nomeVendedor.get(f.vendedor_id ?? "") ?? "—"}</p>
                    </div>
                    {podeAgir && <AcoesSugestao id={f.id} dataSugerida={new Date(Date.parse(f.prazo) - 3 * 3_600_000).toISOString().slice(0, 10)} />}
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        )}

        {aba === "sem_retorno" && (
          <Painel titulo="Leads sem retorno" descricao={`Abertos, sem ação humana há mais de ${base.cfg.sla.sem_retorno_horas} h e sem retorno agendado — do mais antigo para o mais recente.`}>
            {semRetorno.length === 0 ? (
              <Vazio>Nenhum lead parado.</Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Lead</th>
                      <th className="py-2 font-medium">Vendedor</th>
                      <th className="py-2 font-medium">Última ação humana</th>
                      <th className="py-2 font-medium">Criado em</th>
                      {podeAgir && <th className="py-2 font-medium">Agendar retorno</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {semRetorno.slice(0, 150).map((t) => {
                      const ultima = idx.ultimaAcao(t.id);
                      return (
                        <tr key={t.id} className="border-t align-top">
                          <td className="py-2.5"><Link href={`/crm/${t.id}`} className="font-medium text-interlig-azul hover:underline">{t.cliente_nome ?? "Abrir lead"}</Link></td>
                          <td className="py-2.5 text-xs">{nomeVendedor.get(t.vendedor_id ?? "") ?? "—"}</td>
                          <td className="py-2.5 text-xs">{ultima ? fmtDataHora(new Date(ultima).toISOString()) : <span className="text-farol-vermelho">nenhuma</span>}</td>
                          <td className="py-2.5 text-xs">{fmtDataHora(t.criado_em)}</td>
                          {podeAgir && <td className="py-2.5"><AgendarRetorno ticketId={t.id} /></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>
        )}

        {aba === "historico" && (
          <Painel titulo="Histórico de follow-ups" descricao="Concluídos, cancelados e rejeitados — com a evidência de como a execução foi detectada.">
            {historico.length === 0 ? (
              <Vazio>Sem histórico ainda.</Vazio>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Lead</th>
                      <th className="py-2 font-medium">Vendedor</th>
                      <th className="py-2 font-medium">Prazo</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Quando</th>
                      <th className="py-2 font-medium">Evidência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((f) => (
                      <tr key={f.id} className="border-t">
                        <td className="py-2"><Link href={`/crm/${f.ticket_id}`} className="text-interlig-azul hover:underline">{ticket.get(f.ticket_id)?.cliente_nome ?? "Abrir lead"}</Link></td>
                        <td className="py-2 text-xs">{nomeVendedor.get(f.vendedor_id ?? "") ?? "—"}</td>
                        <td className="py-2 text-xs">{fmtDataHora(f.prazo)}</td>
                        <td className="py-2 text-xs">{ROTULO_STATUS[f.status] ?? f.status}</td>
                        <td className="py-2 text-xs">{fmtDataHora(f.concluido_em)}</td>
                        <td className="py-2 text-xs text-muted-foreground">{f.evidencia ?? "—"} · {ROTULO_ORIGEM[f.origem] ?? f.origem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Painel>
        )}
      </div>
    </div>
  );
}
