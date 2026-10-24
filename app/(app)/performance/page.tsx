import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Bot, Flame, Sparkles, Trophy } from "lucide-react";
import { BarraComposicao, FunilHorizontal } from "@/components/performance/barras";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtBrl, fmtBrlCurto, fmtDuracao, fmtNum, fmtPct } from "@/components/performance/formato";
import { GraficoEvolucao } from "@/components/performance/graficos";
import { Kpi } from "@/components/performance/kpi";
import { AvisoComparacao, BarraProgresso, NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { listarAlertas } from "@/lib/performance/alertas/dados";
import { acoesPrioritarias } from "@/lib/performance/dados/acoes";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { indexar, rotuloSetor } from "@/lib/performance/dados/calcular";
import { calcularFunil } from "@/lib/performance/dados/funil";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";

export const dynamic = "force-dynamic";

const COR_ORIGEM = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#94a3b8"];

export default async function VisaoGeral({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  if (ctx.escopo.papel === "vendedor") redirect("/performance/vendedor/eu");
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const { totais: t, totaisAnteriores: ta, linhas } = ap;
  const idx = indexar(ap.base);
  const ids = new Set(linhas.map((l) => l.vendedor.id));
  const funil = calcularFunil(ap.base, idx, ctx.periodo.de, ctx.periodo.ate, (tk) => ap.noEscopo(tk.vendedor_id, tk.pop_id), "entrada");
  const alertas = await listarAlertas(ctx.escopo, { limite: 30 });
  const acoes = acoesPrioritarias(ap.base, linhas, t);

  // qualidade agregada (soma de casos e bases dos sinais maduros)
  const somaQual = (k: string) =>
    linhas.reduce((s, l) => ({ casos: s.casos + (l.qualidade.indicadores[k].numerador ?? 0), base: s.base + (l.qualidade.indicadores[k].denominador ?? 0) }), { casos: 0, base: 0 });
  const quali = [
    { k: "cancel_antes_instalacao", rotulo: "Cancelamento antes da instalação" },
    { k: "cancel_30", rotulo: "Cancelamento em até 30 dias" },
    { k: "churn_90", rotulo: "Churn em até 90 dias" },
    { k: "inad_1a", rotulo: "Inadimplência da 1ª fatura" },
  ].map((q) => ({ ...q, ...somaQual(q.k) }));
  const minimo = ap.base.cfg.volume_minimo.vendas_maduras;

  // inteligência das conversas no período
  const [deMs, ateMs] = [Date.parse(`${ctx.periodo.de}T00:00:00-03:00`), Date.parse(`${ctx.periodo.ate}T23:59:59.999-03:00`)];
  const popDaConversa = new Map(ap.base.conversas.map((c) => [c.id, c.pop_id]));
  const analises = ap.base.analises.filter((a) => ap.noEscopo(a.vendedor_id, popDaConversa.get(a.conversa_id)) && Date.parse(a.concluido_em) >= deMs && Date.parse(a.concluido_em) <= ateMs);

  const ranking = linhas.filter((l) => l.posicao !== null);
  const setores = [...new Set(ranking.map((l) => l.vendedor.setor ?? ""))];
  const contagem = { critico: alertas.filter((a) => a.categoria === "critico").length, atencao: alertas.filter((a) => a.categoria === "atencao").length, informativo: alertas.filter((a) => a.categoria === "informativo").length };

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={`${ctx.periodo.rotulo} · comparado a ${ctx.periodo.deAnterior.split("-").reverse().join("/")}–${ctx.periodo.ateAnterior.split("-").reverse().join("/")}`} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />

      <AvisoComparacao texto={ap.avisoComparacao} />
      <div className="perf-kpis">
        <Kpi rotulo="Leads recebidos" valor={fmtNum(t.leadsRecebidos)} atual={t.leadsRecebidos} anterior={ta.leadsRecebidos} contexto="vs. anterior" titulo="Leads criados no período (fora vendas lançadas direto no SGP)" />
        <Kpi rotulo="Leads atendidos" valor={fmtNum(t.leadsAtendidos)} contexto={t.leadsRecebidos ? `${fmtPct(t.leadsAtendidos / t.leadsRecebidos)} dos recebidos` : undefined} rodape={<BarraProgresso fracao={t.leadsRecebidos ? t.leadsAtendidos / t.leadsRecebidos : null} tom="azul" />} />
        <Kpi rotulo="Aguardando atendimento" valor={fmtNum(t.leadsAguardando)} contexto="abertos, sem ação humana" tom={t.leadsAguardando > 0 ? "amarelo" : undefined} />
        <Kpi rotulo="Leads qualificados" valor={fmtNum(t.leadsQualificados)} contexto={t.leadsRecebidos ? `${fmtPct(t.leadsQualificados / t.leadsRecebidos)} de qualificação` : undefined} />
        <Kpi rotulo="Vendas fechadas" valor={fmtNum(t.vendas)} atual={t.vendas} anterior={ta.vendas} contexto="vs. anterior" />
        <Kpi rotulo="Conversão real" valor={fmtPct(t.conversao)} atual={t.conversao} anterior={ta.conversao} tipoVariacao="pontos" contexto={`${fmtNum(t.fechados)} fechados`} titulo="Tickets convertidos ÷ tickets fechados no período (PRD 5.14)" />
        <Kpi rotulo="Contratos ativados" valor={fmtNum(t.ativacoes)} atual={t.ativacoes} anterior={ta.ativacoes} contexto="vs. anterior" />
        <Kpi rotulo="Receita mensal nova" valor={fmtBrlCurto(t.receitaNova)} titulo={`Receita mensal nova: ${fmtBrl(t.receitaNova)}`} atual={t.receitaNova} anterior={ta.receitaNova} contexto={t.ticketMedio ? `ticket ${fmtBrl(t.ticketMedio)}` : undefined} />
        <Kpi rotulo="Ticket médio" valor={fmtBrl(t.ticketMedio)} atual={t.ticketMedio} anterior={ta.ticketMedio} contexto="vs. anterior" />
        <Kpi rotulo="Follow-ups pendentes" valor={fmtNum(t.followupsPendentes)} contexto="programados e de hoje" />
        <Kpi rotulo="Follow-ups vencidos" valor={fmtNum(t.followupsVencidos)} tom={t.followupsVencidos ? "vermelho" : undefined} contexto={!t.followupsVencidos ? "nenhum" : t.followupsVencidosRobo ? `${fmtNum(t.followupsVencidosRobo)} automáticos do robô` : "precisam de ação"} />
        <Kpi rotulo="Leads quentes parados" valor={fmtNum(t.leadsQuentesParados)} tom={t.leadsQuentesParados ? "vermelho" : undefined} contexto={t.leadsQuentesParados ? "sem ação após o sinal" : "nenhum"} />
        <Kpi rotulo="1ª resposta humana" valor={fmtDuracao(t.primeiraRespostaMediana)} atual={t.primeiraRespostaMediana} anterior={ta.primeiraRespostaMediana} menorEhMelhor contexto={t.slaPct !== null ? `${fmtPct(t.slaPct)} no SLA` : "mediana no expediente"} />
        <Kpi rotulo="Esforço médio" valor={t.esforcoMedio === null ? "N/D" : `${fmtNum(t.esforcoMedio)}/100`} atual={t.esforcoMedio} anterior={ta.esforcoMedio} contexto="score do time" />
        <Kpi rotulo="Qualidade média" valor={t.qualidadeMedia === null ? "N/D" : `${fmtNum(t.qualidadeMedia)}/100`} contexto={t.qualidadeMedia === null ? "coortes em maturação" : "vendas maduras"} />
        <Kpi
          rotulo="Meta de vendas"
          valor={t.metaPeriodo ? `${fmtNum(t.vendasComMeta)}/${fmtNum(t.metaPeriodo)}` : "Sem meta"}
          contexto={t.metaPct !== null ? `${fmtPct(t.metaPct)} da meta proporcional${t.vendas > t.vendasComMeta ? " · só quem tem meta" : ""}` : undefined}
          titulo={t.vendas > t.vendasComMeta ? `${fmtNum(t.vendas - t.vendasComMeta)} venda(s) de quem está sem meta no mês ficam fora do cumprimento (mesma regra do dashboard).` : undefined}
          rodape={<BarraProgresso fracao={t.metaPct} />}
        />
      </div>

      <div className="perf-graficos mt-4">
        <Painel titulo="Evolução de resultados" descricao="Por dia: leads pela data de criação, vendas pela data da venda, ativações pela data de ativação.">
          <GraficoEvolucao dados={t.serie} />
        </Painel>
        <Painel titulo="Funil de vendas" descricao={`Coorte de entrada: ${fmtNum(funil.total)} leads criados no período.`} acao={<Link href="/performance/funil" className="text-xs font-medium text-interlig-azul hover:underline">Detalhar</Link>}>
          {funil.total ? <FunilHorizontal etapas={funil.etapas} /> : <Vazio>Nenhum lead no período.</Vazio>}
        </Painel>
        <Painel titulo="Origem dos leads" descricao="Leads criados no período, por origem.">
          <BarraComposicao partes={funil.porOrigem.slice(0, 5).map((o, i) => ({ rotulo: o.origem, valor: o.leads, cor: COR_ORIGEM[i] }))} />
          {funil.porOrigem.length > 0 && (
            <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs">
              {(() => {
                const melhor = [...funil.porOrigem].filter((o) => o.leads >= 5 && o.conversao !== null).sort((a, b) => (b.conversao ?? 0) - (a.conversao ?? 0))[0];
                return melhor ? (
                  <p>
                    Maior conversão: <span className="font-medium">{melhor.origem}</span> — {fmtPct(melhor.conversao)} ({melhor.vendas} de {melhor.leads})
                  </p>
                ) : (
                  <p className="text-muted-foreground">Volume ainda baixo para comparar a conversão das origens.</p>
                );
              })()}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">Sem UTM/campanha na integração atual: custo e CAC por canal ficam indisponíveis.</p>
        </Painel>
      </div>

      <div className="perf-duas mt-4">
        <Painel
          titulo="Ranking de Performance Comercial (IPC)"
          descricao="IPC = 35% esforço + 40% resultado + 25% qualidade. Só compara quem tem a mesma função; * = provisório."
          acao={<Link href="/performance/ranking" className="text-xs font-medium text-interlig-azul hover:underline">Ver ranking completo</Link>}
        >
          {ranking.length === 0 ? (
            <Vazio>Sem vendedores comparáveis no período.</Vazio>
          ) : (
            <div className="space-y-4">
              {setores.map((s) => (
                <div key={s} className="overflow-x-auto">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rotuloSetor(s)}</p>
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="w-8 py-1.5 font-medium">#</th>
                        <th className="py-1.5 font-medium">Vendedor</th>
                        <th className="py-1.5 text-right font-medium">Esforço</th>
                        <th className="py-1.5 text-right font-medium">Resultado</th>
                        <th className="py-1.5 text-right font-medium">Qualidade</th>
                        <th className="py-1.5 text-right font-medium">IPC</th>
                        <th className="py-1.5 text-right font-medium">Vendas</th>
                        <th className="py-1.5 text-right font-medium">Conversão</th>
                        <th className="w-28 py-1.5 pl-3 font-medium">Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking
                        .filter((l) => (l.vendedor.setor ?? "") === s)
                        .slice(0, 5)
                        .map((l) => (
                          <tr key={l.vendedor.id} className="border-t">
                            <td className="py-2 tabular-nums">{l.posicao === 1 ? <Trophy className="h-4 w-4 text-farol-amarelo" aria-label="1º lugar" /> : l.posicao}</td>
                            <td className="py-2">
                              <Link href={`/performance/vendedor/${l.vendedor.id}?${new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]).toString()}`} className="font-medium hover:underline">
                                {l.vendedor.nome}
                              </Link>
                              <span className="block text-xs text-muted-foreground">{l.vendedor.pop_nome ?? ""}</span>
                            </td>
                            <td className="py-2 text-right"><NotaScore valor={l.esforco.score.valor} provisorio={l.esforco.score.provisorio} tamanho="sm" /></td>
                            <td className="py-2 text-right"><NotaScore valor={l.resultado.score.valor} provisorio={l.resultado.score.provisorio} tamanho="sm" /></td>
                            <td className="py-2 text-right"><NotaScore valor={l.qualidade.score.valor} provisorio={l.qualidade.score.provisorio} tamanho="sm" /></td>
                            <td className="py-2 text-right"><NotaScore valor={l.ipc.valor} provisorio={l.ipc.provisorio} /></td>
                            <td className="py-2 text-right tabular-nums">{l.numeros.vendas}</td>
                            <td className="py-2 text-right tabular-nums">{fmtPct(l.numeros.conversao)}</td>
                            <td className="py-2 pl-3">
                              <span className="block text-xs tabular-nums">{fmtPct(l.numeros.metaPct)}</span>
                              <BarraProgresso fracao={l.numeros.metaPct} />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Painel>

        <Painel
          titulo="Alertas e oportunidades"
          descricao={`${contagem.critico} críticos · ${contagem.atencao} de atenção · ${contagem.informativo} informativos`}
          acao={<Link href="/performance/alertas" className="text-xs font-medium text-interlig-azul hover:underline">Ver todos</Link>}
        >
          {alertas.length === 0 ? (
            <Vazio>Nenhum alerta aberto. A central é atualizada pela rotina automática.</Vazio>
          ) : (
            <ul className="divide-y">
              {alertas.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 py-2">
                  {a.categoria === "critico" ? <Flame className="mt-0.5 h-4 w-4 shrink-0 text-farol-vermelho" aria-hidden /> : a.categoria === "atencao" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-farol-amarelo" aria-hidden /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-farol-verde" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{a.titulo}</p>
                    {a.detalhe && <p className="line-clamp-2 text-xs text-muted-foreground">{a.detalhe}</p>}
                  </div>
                  <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", a.categoria === "critico" ? "bg-farol-vermelho/10 text-farol-vermelho" : a.categoria === "atencao" ? "bg-farol-amarelo/15 text-[hsl(38_92%_33%)]" : "bg-farol-verde/10 text-farol-verde")}>
                    {a.categoria === "critico" ? "Crítico" : a.categoria === "atencao" ? "Atenção" : "Informativo"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>

      <div className="perf-tres mt-4">
        <Painel titulo="Qualidade das vendas" descricao="Coortes maduras do time (sinal de investigação, não culpa automática)." acao={<Link href="/performance/qualidade" className="text-xs font-medium text-interlig-azul hover:underline">Detalhar</Link>}>
          <ul className="space-y-2.5">
            {quali.map((q) => (
              <li key={q.k} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{q.rotulo}</span>
                  <span className="tabular-nums">{q.base >= minimo ? <span className="font-semibold">{fmtPct(q.casos / q.base, 1)}</span> : <span className="text-xs text-muted-foreground">em maturação</span>}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{q.casos} de {q.base} na coorte</p>
              </li>
            ))}
          </ul>
        </Painel>

        <Painel titulo="Inteligência das conversas (IA)" acao={<Link href="/performance/conversas" className="text-xs font-medium text-interlig-azul hover:underline">Abrir</Link>}>
          {!ap.base.cfg.ia.habilitada && analises.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3 text-sm">
              <Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">Análise por IA desligada</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Os indicadores determinísticos (tempos, follow-ups, funil) funcionam sem IA. {ctx.escopo.podeConfigurar ? <Link href="/performance/configuracoes" className="text-interlig-azul hover:underline">Ativar em Configurações</Link> : "O gestor pode ativar em Configurações."}
                </p>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Leads quentes", analises.filter((a) => a.temperatura === "quente").length],
                ["Intenção de compra", analises.filter((a) => a.intencao_compra).length],
                ["Objeções identificadas", analises.reduce((s, a) => s + a.objecoes.length, 0)],
                ["Conversas analisadas", analises.length],
              ].map(([r, n]) => (
                <div key={String(r)} className="rounded-lg bg-muted/40 p-2.5">
                  <dt className="text-xs text-muted-foreground">{r}</dt>
                  <dd className="text-xl font-semibold">{fmtNum(Number(n))}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {fmtNum(ap.cobertura.conversasNoPeriodo)} conversas comerciais coletadas no período · {fmtPct(ap.cobertura.conversasNoPeriodo ? ap.cobertura.conversasComLead / ap.cobertura.conversasNoPeriodo : null)} vinculadas a um lead.
          </p>
        </Painel>

        <Painel titulo="O que fazer agora?" descricao="Ações priorizadas a partir de dados verificáveis.">
          {acoes.length === 0 ? (
            <Vazio>Nada urgente no escopo selecionado.</Vazio>
          ) : (
            <ol className="space-y-2">
              {acoes.map((a, i) => (
                <li key={a.chave} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">
                      {a.titulo} <span className="tabular-nums">({fmtNum(a.quantidade)})</span>
                    </p>
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
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Cobertura dos dados: chat coletado até {ap.cobertura.ultimaColeta ? new Date(ap.cobertura.ultimaColeta).toLocaleString("pt-BR", { timeZone: "America/Santarem" }) : "carga histórica"} ·
        {" "}follow-ups registrados desde {ap.cobertura.primeiroFollowup ? new Date(ap.cobertura.primeiroFollowup).toLocaleDateString("pt-BR", { timeZone: "America/Santarem" }) : "a implantação"} ·
        {" "}ligações sem integração.
        {ap.cobertura.agentesSemVinculo.length > 0 && ` Agentes do chat sem vínculo com vendedor: ${ap.cobertura.agentesSemVinculo.join(", ")}.`}
      </p>
    </div>
  );
}
