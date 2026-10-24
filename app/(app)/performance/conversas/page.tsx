import Link from "next/link";
import { BotaoAmostraIa } from "@/components/performance/acoes-ia";
import { BarraComposicao, BarrasSimples } from "@/components/performance/barras";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtDataHora, fmtDuracao, fmtNum, fmtNum1, fmtPct } from "@/components/performance/formato";
import { Kpi } from "@/components/performance/kpi";
import { NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { mediana } from "@/lib/performance/regras/normalizacao";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";
import { custoIaDoMes } from "@/lib/performance/ia/pipeline";
import { CRITERIOS, ROTULO_CRITERIO, ROTULO_OBJECAO, ROTULO_OPORTUNIDADE } from "@/lib/performance/ia/schema";

export const dynamic = "force-dynamic";
// a amostra manual da IA (botão do gestor) roda por até ~50 s
export const maxDuration = 60;

const COR_TEMP: Record<string, string> = { quente: "#eb6834", morno: "#eda100", frio: "#2a78d6", indeterminado: "#94a3b8" };
const ROTULO_STATUS_LEAD: Record<string, string> = { a_fazer: "A fazer", assinou: "Assinou", perdido: "Perdido", sem_cobertura: "Sem cobertura", em_espera: "Em espera", atencao: "Atenção", encerrado: "Encerrado" };

type Resultado = {
  resumo?: string;
  plano_interesse?: string | null;
  qualidade_atendimento?: { criterio: string; nota: number | null }[];
  oportunidade_esquecida?: { tipo: string; descricao: string } | null;
};

const inicioSemana = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3_600_000);
  const dia = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dia === 0 ? -6 : 1 - dia));
  return d.toISOString().slice(0, 10);
};

export default async function ConversasPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const cfg = ap.base.cfg;
  const ids = new Set(ap.linhas.map((l) => l.vendedor.id));
  const nome = new Map(ap.base.vendedores.map((v) => [v.id, v.nome]));
  const [deMs, ateMs] = [Date.parse(`${ctx.periodo.de}T00:00:00-03:00`), Date.parse(`${ctx.periodo.ate}T23:59:59.999-03:00`)];
  const conversaPorId = new Map(ap.base.conversas.map((c) => [c.id, c]));
  const quando = (a: { conversa_id: string; concluido_em: string }) => conversaPorId.get(a.conversa_id)?.finalizada_em ?? a.concluido_em;
  // sem vendedor (só robô, fila abandonada, atendente sem vínculo) só no escopo total
  const analises = ap.base.analises.filter((a) => ap.noEscopo(a.vendedor_id, conversaPorId.get(a.conversa_id)?.pop_id) && Date.parse(quando(a)) >= deMs && Date.parse(quando(a)) <= ateMs);
  const conversas = ap.base.conversas.filter((c) => c.finalizada_em && Date.parse(c.finalizada_em) >= deMs && Date.parse(c.finalizada_em) <= ateMs && ap.noEscopo(c.vendedor_id, c.pop_id));

  // estado da IA (só administrador vê custo e fila)
  const admin = criarClienteAdmin();
  const [{ data: integ }, { count: fila }, { usd: custoMes }] = await Promise.all([
    admin.from("integracoes_config").select("config").eq("sistema", "anthropic").maybeSingle(),
    admin.from("analises_conversa").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    custoIaDoMes(ap.base.hoje),
  ]);
  const temChave = Boolean((integ?.config as { api_key?: string } | null)?.api_key);
  const modelo = cfg.ia.modelo || ((integ?.config as { modelo?: string } | null)?.modelo ?? "—");

  const conta = <T,>(lista: T[], chave: (x: T) => string | null) => {
    const m = new Map<string, number>();
    for (const x of lista) {
      const k = chave(x);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const objecoes = conta(analises.flatMap((a) => a.objecoes), (o) => o);
  const planos = conta(analises, (a) => ((a.resultado as Resultado | null)?.plano_interesse ?? null));
  const perdas = conta(analises.filter((a) => ["perdido", "sem_cobertura", "em_espera", "atencao"].includes(a.status_lead ?? "")), (a) => ROTULO_STATUS_LEAD[a.status_lead ?? ""] ?? null);
  const criterios = CRITERIOS.map((c) => {
    const notas = analises.flatMap((a) => ((a.resultado as Resultado | null)?.qualidade_atendimento ?? []).filter((q) => q.criterio === c && q.nota !== null).map((q) => q.nota as number));
    return { c, media: notas.length ? notas.reduce((s, x) => s + x, 0) / notas.length : null, n: notas.length };
  }).filter((x) => x.media !== null).sort((a, b) => (a.media ?? 0) - (b.media ?? 0));
  const semanas = conta(analises, (a) => inicioSemana(quando(a))).sort((a, b) => a[0].localeCompare(b[0]));
  const intencaoSemana = semanas.map(([s, n]) => ({ rotulo: s.split("-").reverse().slice(0, 2).join("/"), total: n, comIntencao: analises.filter((a) => inicioSemana(quando(a)) === s && a.intencao_compra).length }));
  const oportunidades = analises.filter((a) => (a.resultado as Resultado | null)?.oportunidade_esquecida).slice(0, 15);
  const porVendedor = [...ids]
    .map((v) => {
      const da = analises.filter((a) => a.vendedor_id === v && a.score_atendimento !== null);
      return { v, n: da.length, media: da.length ? da.reduce((s, a) => s + (a.score_atendimento ?? 0), 0) / da.length : null };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => (b.media ?? 0) - (a.media ?? 0));
  const porEquipe = conta(conversas, (c) => c.equipe);
  const pr = conversas.map((c) => c.primeira_resposta_util_seg).filter((x): x is number => x !== null);
  const recentes = [...analises].sort((a, b) => Date.parse(quando(b)) - Date.parse(quando(a))).slice(0, 25);

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <span>Análise automática: <strong className={cfg.ia.habilitada ? "text-farol-verde" : "text-muted-foreground"}>{cfg.ia.habilitada ? "ligada" : "desligada"}</strong></span>
          <span>Provedor: <strong>{temChave ? `Anthropic (${modelo})` : "sem chave configurada"}</strong></span>
          {ctx.escopo.podeConfigurar && (
            <>
              <span>Fila: <strong>{fmtNum(fila ?? 0)}</strong></span>
              <span>Custo no mês: <strong>US$ {custoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> de US$ {cfg.ia.custo_max_mensal_usd.toLocaleString("pt-BR")}</span>
            </>
          )}
        </div>
        {ctx.escopo.podeConfigurar && temChave && <BotaoAmostraIa />}
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Conversas coletadas" valor={fmtNum(conversas.length)} contexto="encerradas no período" />
        <Kpi rotulo="Analisadas pela IA" valor={fmtNum(analises.length)} contexto={conversas.length ? `${fmtPct(analises.length / conversas.length)} das coletadas` : undefined} />
        <Kpi rotulo="Leads quentes" valor={fmtNum(analises.filter((a) => a.temperatura === "quente").length)} />
        <Kpi rotulo="Intenção de compra" valor={fmtNum(analises.filter((a) => a.intencao_compra).length)} />
        <Kpi rotulo="Atendimento (média IA)" valor={porVendedor.length ? fmtNum1(analises.filter((a) => a.score_atendimento !== null).reduce((s, a, _i, arr) => s + (a.score_atendimento ?? 0) / arr.length, 0)) : "N/D"} contexto="rubrica configurável" />
        <Kpi rotulo="Cliente sem resposta" valor={fmtNum(conversas.filter((c) => c.cliente_sem_resposta).length)} tom={conversas.some((c) => c.cliente_sem_resposta) ? "amarelo" : undefined} contexto={`1ª resposta mediana ${fmtDuracao(mediana(pr))}`} />
      </div>

      {analises.length === 0 ? (
        <Painel className="mt-4" titulo="Ainda sem análises de IA no período" descricao="Os indicadores determinísticos (tempos, volume, sem resposta) continuam valendo sem IA.">
          <p className="text-sm text-muted-foreground">
            {cfg.ia.habilitada ? "A fila é processada pela rotina automática a cada ciclo, respeitando o limite diário e o teto de custo." : "A análise automática está desligada."}{" "}
            {ctx.escopo.podeConfigurar && <Link href="/performance/configuracoes" className="text-interlig-azul hover:underline">Ajustar em Configurações</Link>}
          </p>
          {porEquipe.length > 0 && (
            <div className="mt-3 max-w-md">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Conversas por equipe</p>
              <BarrasSimples itens={porEquipe.map(([rotulo, valor]) => ({ rotulo, valor }))} />
            </div>
          )}
        </Painel>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Painel titulo="Temperatura dos leads" descricao="Classificação da IA nas conversas analisadas (inferência, revisável).">
              <BarraComposicao partes={["quente", "morno", "frio", "indeterminado"].map((t) => ({ rotulo: t[0].toUpperCase() + t.slice(1), valor: analises.filter((a) => a.temperatura === t).length, cor: COR_TEMP[t] }))} />
            </Painel>
            <Painel titulo="Objeções mais frequentes">
              {objecoes.length ? <BarrasSimples itens={objecoes.slice(0, 8).map(([k, v]) => ({ rotulo: ROTULO_OBJECAO[k as keyof typeof ROTULO_OBJECAO] ?? k, valor: v }))} /> : <Vazio>Nenhuma objeção identificada.</Vazio>}
            </Painel>
            <Painel titulo="Planos mais procurados" descricao="Só planos reais do cadastro (a IA não inventa plano).">
              {planos.length ? <BarrasSimples itens={planos.slice(0, 8).map(([k, v]) => ({ rotulo: k, valor: v }))} /> : <Vazio>Sem plano claro nas conversas.</Vazio>}
            </Painel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Painel titulo="Temas para treinamento" descricao="Critérios da rubrica com a menor nota média (0–10).">
              {criterios.length ? (
                <BarrasSimples itens={criterios.slice(0, 6).map((x) => ({ rotulo: ROTULO_CRITERIO[x.c], valor: Math.round((x.media ?? 0) * 10) / 10, detalhe: `${x.n} avaliações` }))} formatar={(n) => fmtNum1(n)} cor="bg-farol-amarelo/80" />
              ) : (
                <Vazio>Sem atendimento humano avaliado.</Vazio>
              )}
            </Painel>
            <Painel titulo="Motivos de perda identificados" descricao="Situação do lead segundo a IA.">
              {perdas.length ? <BarrasSimples itens={perdas.map(([k, v]) => ({ rotulo: k, valor: v }))} /> : <Vazio>Sem perdas identificadas.</Vazio>}
            </Painel>
            <Painel titulo="Tendência de intenção de compra" descricao="Conversas com intenção ÷ analisadas, por semana.">
              {intencaoSemana.length ? <BarrasSimples itens={intencaoSemana.map((s) => ({ rotulo: `semana ${s.rotulo}`, valor: s.total ? Math.round((s.comIntencao / s.total) * 100) : 0, detalhe: `${s.comIntencao} de ${s.total}` }))} formatar={(n) => `${n}%`} /> : <Vazio>Sem dados.</Vazio>}
            </Painel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Painel titulo="Qualidade média do atendimento por vendedor" descricao="Apoio à gestão: não usar isoladamente para decisão trabalhista ou disciplinar.">
              {porVendedor.length ? (
                <ul className="divide-y text-sm">
                  {porVendedor.map((x) => (
                    <li key={x.v} className="flex items-center justify-between py-2">
                      <span>{nome.get(x.v) ?? "—"} <span className="text-xs text-muted-foreground">({x.n} conversas)</span></span>
                      <NotaScore valor={x.media === null ? null : Math.round(x.media * 10) / 10} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Vazio>Sem notas de atendimento.</Vazio>
              )}
            </Painel>
            <Painel titulo="Oportunidades recuperáveis" descricao="Eventos identificáveis em que a venda parou por falta de ação do time.">
              {oportunidades.length ? (
                <ul className="divide-y text-sm">
                  {oportunidades.map((a) => {
                    const o = (a.resultado as Resultado).oportunidade_esquecida!;
                    return (
                      <li key={a.conversa_id} className="flex items-start justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <span className="font-medium">{ROTULO_OPORTUNIDADE[o.tipo as keyof typeof ROTULO_OPORTUNIDADE] ?? o.tipo}</span>
                          <span className="block text-xs text-muted-foreground">{nome.get(a.vendedor_id ?? "") ?? ""} · {fmtDataHora(quando(a))}</span>
                        </span>
                        {a.ticket_id && <Link href={`/crm/${a.ticket_id}`} className="shrink-0 text-xs font-medium text-interlig-azul hover:underline">abrir lead</Link>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Vazio>Nenhuma oportunidade parada identificada.</Vazio>
              )}
            </Painel>
          </div>

          {ctx.escopo.podeVerConversas && (
            <Painel className="mt-4" titulo="Análises recentes" descricao="Resumo, situação e nota de cada conversa analisada. Abrir mostra a conversa (mascarada), as evidências e a revisão humana. Cada abertura fica registrada.">
              <ul className="divide-y">
                {recentes.map((a) => (
                  <li key={a.conversa_id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
                    <span className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_TEMP[a.temperatura ?? "indeterminado"] }} title={a.temperatura ?? ""} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2">{(a.resultado as Resultado | null)?.resumo || <span className="italic text-muted-foreground">resumo apagado pela retenção de dados</span>}</p>
                      <p className="text-xs text-muted-foreground">
                        {nome.get(a.vendedor_id ?? "") ?? "sem vendedor"} · {fmtDataHora(quando(a))} · {ROTULO_STATUS_LEAD[a.status_lead ?? ""] ?? "—"}
                        {a.revisada && " · revisada por pessoa"}
                      </p>
                    </div>
                    <NotaScore valor={a.score_atendimento} tamanho="sm" titulo="Nota do atendimento (IA)" />
                    <Link href={`/performance/conversas/${a.conversa_id}`} className="shrink-0 text-xs font-medium text-interlig-azul hover:underline">abrir</Link>
                  </li>
                ))}
              </ul>
            </Painel>
          )}
        </>
      )}
    </div>
  );
}
