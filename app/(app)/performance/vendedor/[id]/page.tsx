import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CircleAlert, CircleCheck, Flame } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtBrl, fmtData, fmtDataHora, fmtDuracao, fmtNum, fmtPct } from "@/components/performance/formato";
import { GraficoEvolucaoScore } from "@/components/performance/graficos";
import { Kpi } from "@/components/performance/kpi";
import { AvisoComparacao, ComposicaoScore, NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { acoesPrioritarias } from "@/lib/performance/dados/acoes";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { calcularTotais, indexar, rotuloSetor } from "@/lib/performance/dados/calcular";
import { detalheVendedor } from "@/lib/performance/dados/vendedor";
import { alcanca } from "@/lib/performance/escopo";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";
import { ROTULO_MOTIVO } from "@/lib/performance/tipos";

export const dynamic = "force-dynamic";

export default async function PerfilVendedor({ params, searchParams }: { params: { id: string }; searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const id = params.id === "eu" ? ctx.escopo.vendedorProprio : params.id;
  if (!id || !alcanca(ctx.escopo, id)) notFound();
  // o perfil usa a função inteira do vendedor (para posição e média do time)
  const ap = await apurarPerformance(ctx.escopo.papel === "vendedor" ? { ...ctx.escopo, vendedorIds: null } : ctx.escopo, ctx.periodo, {});
  const linha = ap.linhas.find((l) => l.vendedor.id === id);
  if (!linha) {
    return (
      <div>
        <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={[]} setores={[]} coordenadores={[]} />
        <Vazio>Sem atividade deste vendedor no período, ou a função dele não é avaliada pelo módulo.</Vazio>
      </div>
    );
  }
  const v = linha.vendedor;
  const idx = indexar(ap.base);
  const totaisProprios = calcularTotais(ap.base, idx, [linha], ctx.periodo.de, ctx.periodo.ate, { incluirSemDono: false });
  const acoes = acoesPrioritarias(ap.base, [linha], totaisProprios, { vendedorId: v.id });
  const d = detalheVendedor(ap, linha);
  const ant = ap.anteriores.get(v.id);
  const totalSetor = ap.linhas.filter((l) => l.vendedor.setor === v.setor && l.posicao !== null).length;
  const e = linha.esforco.indicadores;
  const q = linha.qualidade.indicadores;

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={[]} setores={[]} coordenadores={[]} />
      <AvisoComparacao texto={ap.avisoComparacao} />

      <section className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 shadow-sm">
        <span className="[&>span]:h-14 [&>span]:w-14 [&>span]:text-lg">
          <AvatarAgente nome={v.nome} foto={v.foto_url} tamanho="lg" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{v.nome}</h2>
          <p className="text-sm text-muted-foreground">
            {rotuloSetor(v.setor)} · {v.pop_nome ?? "sem unidade"} · gestor responsável: {v.coordenador_nome ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">{ctx.periodo.rotulo}</p>
          {linha.flags.motivoNaoComparavel && <p className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs">Fora da comparação: {linha.flags.motivoNaoComparavel}</p>}
        </div>
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">IPC</p>
            <NotaScore valor={linha.ipc.valor} provisorio={linha.ipc.provisorio} tamanho="lg" />
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Posição</p>
            <p className="text-2xl font-semibold">{linha.posicao ? `${linha.posicao}º` : "—"}</p>
            {linha.posicao && <p className="text-[11px] text-muted-foreground">de {totalSetor} na função</p>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Leads recebidos" valor={fmtNum(linha.numeros.leadsRecebidos)} atual={linha.numeros.leadsRecebidos} anterior={ant?.numeros.leadsRecebidos ?? null} />
        <Kpi rotulo="Leads trabalhados" valor={fmtNum(linha.numeros.leadsTrabalhados)} atual={linha.numeros.leadsTrabalhados} anterior={ant?.numeros.leadsTrabalhados ?? null} />
        <Kpi rotulo="Conversas ativas" valor={fmtNum(linha.numeros.conversasAtivas)} contexto={linha.flags.temCanalChat ? "no chat" : "sem chat vinculado"} />
        <Kpi rotulo="Vendas" valor={fmtNum(linha.numeros.vendas)} atual={linha.numeros.vendas} anterior={ant?.numeros.vendas ?? null} contexto={linha.numeros.metaPeriodo ? `meta ${fmtNum(linha.numeros.metaPeriodo)}` : "sem meta"} />
        <Kpi rotulo="Conversão real" valor={fmtPct(linha.numeros.conversao)} atual={linha.numeros.conversao} anterior={ant?.numeros.conversao ?? null} tipoVariacao="pontos" />
        <Kpi rotulo="Propostas" valor={fmtNum(linha.numeros.propostas)} />
        <Kpi rotulo="Follow-ups concluídos" valor={fmtNum(e.followups_realizados.valor)} contexto={e.followups_prazo.disponivel ? `${fmtPct(e.followups_prazo.valor)} no prazo` : ROTULO_MOTIVO[e.followups_prazo.motivo ?? "sem_dados"]} />
        <Kpi rotulo="Follow-ups atrasados" valor={fmtNum(linha.numeros.followupsAtrasados)} tom={linha.numeros.followupsAtrasados ? "vermelho" : undefined} />
        <Kpi rotulo="1ª resposta (mediana)" valor={fmtDuracao(e.tempo_primeira_resposta.valor)} contexto={e.sla_primeira_resposta.disponivel ? `${fmtPct(e.sla_primeira_resposta.valor)} no SLA` : ROTULO_MOTIVO[e.sla_primeira_resposta.motivo ?? "sem_dados"]} />
        <Kpi rotulo="Ticket médio" valor={fmtBrl(linha.numeros.ticketMedio)} />
        <Kpi rotulo="Receita mensal nova" valor={fmtBrl(linha.numeros.receitaNova)} atual={linha.numeros.receitaNova} anterior={ant?.numeros.receitaNova ?? null} />
        <Kpi rotulo="Ativações" valor={fmtNum(linha.numeros.ativacoes)} />
        <Kpi rotulo="Score de esforço" valor={linha.esforco.score.valor === null ? "N/D" : fmtNum(linha.esforco.score.valor)} atual={linha.esforco.score.valor} anterior={ant?.esforco.score.valor ?? null} />
        <Kpi rotulo="Score de resultado" valor={linha.resultado.score.valor === null ? "N/D" : fmtNum(linha.resultado.score.valor)} />
        <Kpi rotulo="Qualidade da venda" valor={q.qualidade_vendas.valor === null ? "Em maturação" : fmtNum(q.qualidade_vendas.valor)} />
        <Kpi rotulo="Atendimento (IA)" valor={q.qualidade_atendimento.nota === null ? "N/D" : fmtNum(q.qualidade_atendimento.nota)} contexto={q.qualidade_atendimento.nota === null ? ROTULO_MOTIVO[q.qualidade_atendimento.motivo ?? "sem_dados"] : undefined} />
        <Kpi rotulo="Churn 90 dias" valor={q.churn_90.disponivel ? fmtPct(q.churn_90.valor, 1) : "Em maturação"} contexto={`${q.churn_90.numerador ?? 0} de ${q.churn_90.denominador ?? 0} ativados`} />
        <Kpi rotulo="Inadimplência 1ª fatura" valor={q.inad_1a.disponivel ? fmtPct(q.inad_1a.valor, 1) : "Em maturação"} contexto={`${q.inad_1a.numerador ?? 0} de ${q.inad_1a.denominador ?? 0}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Painel titulo="O que fazer agora?" descricao="Prioridades a partir dos seus leads e tarefas.">
          {acoes.length === 0 ? (
            <Vazio>Nada urgente agora.</Vazio>
          ) : (
            <ol className="space-y-2">
              {acoes.map((a, i) => (
                <li key={a.chave} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.titulo} <span className="tabular-nums">({fmtNum(a.quantidade)})</span></p>
                    <p className="text-xs text-muted-foreground">{a.detalhe}</p>
                  </div>
                  <Link href={a.href} className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-interlig-azul hover:bg-muted">
                    {a.rotuloLink} <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Painel>
        <Painel titulo="Feedback inteligente" descricao="Recomendações objetivas, a partir de dados verificáveis do período.">
          {d.feedback.length === 0 ? (
            <Vazio>Sem recomendações para o período.</Vazio>
          ) : (
            <ul className="space-y-2">
              {d.feedback.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {f.tom === "positivo" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-farol-verde" aria-hidden /> : f.tom === "critico" ? <Flame className="mt-0.5 h-4 w-4 shrink-0 text-farol-vermelho" aria-hidden /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-farol-amarelo" aria-hidden />}
                  <span className="min-w-0 flex-1">{f.texto}</span>
                  {f.href && <Link href={f.href} className="shrink-0 text-xs font-medium text-interlig-azul hover:underline">ver</Link>}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ComposicaoScore titulo="Score de esforço — composição" score={linha.esforco.score} indicadores={linha.esforco.indicadores} />
        <ComposicaoScore titulo="Score de resultado — composição" score={linha.resultado.score} indicadores={linha.resultado.indicadores} />
        <ComposicaoScore titulo="Score de qualidade — composição" score={linha.qualidade.score} indicadores={linha.qualidade.indicadores} />
        <ComposicaoScore titulo="IPC — composição" score={linha.ipc} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Painel titulo="Minha carteira" descricao={`${d.carteira.length} leads abertos, do mais prioritário para o menos.`}>
          {d.carteira.length === 0 ? (
            <Vazio>Nenhum lead aberto.</Vazio>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Lead</th>
                    <th className="py-1.5 font-medium">Etapa</th>
                    <th className="py-1.5 font-medium">Última ação</th>
                    <th className="py-1.5 font-medium">Próximo retorno</th>
                    <th className="py-1.5 text-right font-medium">Prioridade</th>
                  </tr>
                </thead>
                <tbody>
                  {d.carteira.slice(0, 60).map((c) => (
                    <tr key={c.ticketId} className="border-t">
                      <td className="py-2">
                        <Link href={`/crm/${c.ticketId}`} className="font-medium text-interlig-azul hover:underline">{c.cliente}</Link>
                        <span className="block text-[11px] text-muted-foreground">desde {fmtDataHora(c.criadoEm)}</span>
                      </td>
                      <td className="py-2 text-xs">{c.etapa}</td>
                      <td className="py-2 text-xs">{c.ultimaAcao ? fmtDataHora(c.ultimaAcao) : <span className="text-farol-vermelho">nenhuma</span>}</td>
                      <td className="py-2 text-xs">{c.proximoRetorno ? fmtDataHora(c.proximoRetorno) : c.semRetorno ? <span className="text-farol-vermelho">sem retorno</span> : "—"}</td>
                      <td className="py-2 text-right">
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium tabular-nums", c.prioridade >= 40 ? "bg-farol-vermelho/10 text-farol-vermelho" : c.prioridade >= 20 ? "bg-farol-amarelo/15 text-[hsl(38_92%_33%)]" : "bg-muted text-muted-foreground")}>
                          {Math.round(c.prioridade)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Painel>
        <div className="space-y-4">
          <Painel titulo="Minhas oportunidades" descricao="Leads com intenção de compra ou cliente quente (IA) e urgência alta (robô).">
            {d.oportunidades.length === 0 ? (
              <Vazio>Nenhuma oportunidade quente aberta.</Vazio>
            ) : (
              <ul className="divide-y text-sm">
                {d.oportunidades.map((o) => (
                  <li key={o.ticketId} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-xs">
                      {o.intencao ? "Intenção de compra" : o.temperatura === "quente" ? "Cliente quente" : "Urgência alta"} · {o.etapa}
                      <span className="block text-muted-foreground">{o.ultimaAcao ? `última ação ${fmtDataHora(o.ultimaAcao)}` : "sem ação humana"}</span>
                    </span>
                    <Link href={`/crm/${o.ticketId}`} className="shrink-0 text-xs font-medium text-interlig-azul hover:underline">Abrir</Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
          <Painel titulo="Minhas tarefas" descricao="Follow-ups pendentes, vencidos e sugestões a aceitar." acao={<Link href={`/performance/followups?vendedor=${v.id}`} className="text-xs font-medium text-interlig-azul hover:underline">Gerenciar</Link>}>
            {d.tarefas.length === 0 ? (
              <Vazio>Sem tarefas abertas.</Vazio>
            ) : (
              <ul className="divide-y text-sm">
                {d.tarefas.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-xs">
                      <span className={cn("mr-1 rounded px-1 py-0.5 text-[11px] font-medium", f.status === "vencido" ? "bg-farol-vermelho/10 text-farol-vermelho" : f.status === "sugerido" ? "bg-interlig-ceu/10 text-interlig-azul" : "bg-muted")}>{f.status}</span>
                      {f.proximo_passo ?? f.motivo ?? "Retorno ao cliente"}
                      <span className="block text-muted-foreground">prazo {fmtDataHora(f.prazo)}</span>
                    </span>
                    <Link href={`/crm/${f.ticket_id}`} className="shrink-0 text-xs font-medium text-interlig-azul hover:underline">Abrir</Link>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Painel titulo="Minha evolução" descricao="IPC semana a semana, com a média da função como referência.">
          {d.semanas.length >= 2 ? <GraficoEvolucaoScore dados={d.semanas} rotulo="Meu IPC" /> : <Vazio>Histórico insuficiente no período carregado.</Vazio>}
        </Painel>
        <Painel titulo="Histórico de atividades" descricao="Eventos comerciais mais recentes.">
          {d.atividades.length === 0 ? (
            <Vazio>Sem atividades registradas.</Vazio>
          ) : (
            <ol className="max-h-[300px] space-y-1.5 overflow-auto text-sm">
              {d.atividades.map((a, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 border-b pb-1.5 last:border-0">
                  <span className="min-w-0">
                    <span className="text-xs text-muted-foreground tabular-nums">{a.soData ? fmtData(a.em) : fmtDataHora(a.em)}</span> · {a.tipo}
                  </span>
                  {a.ticketId && <Link href={`/crm/${a.ticketId}`} className="shrink-0 text-xs text-interlig-azul hover:underline">ticket</Link>}
                </li>
              ))}
            </ol>
          )}
        </Painel>
      </div>
    </div>
  );
}
