import Link from "next/link";
import { BarrasSimples } from "@/components/performance/barras";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtBrl, fmtNum, fmtPct } from "@/components/performance/formato";
import { Kpi } from "@/components/performance/kpi";
import { NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { ehVendaContavel, type ContratoIndicador } from "@/lib/indicadores/regras";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";
import { ROTULO_MOTIVO, type Indicador } from "@/lib/performance/tipos";

export const dynamic = "force-dynamic";

const SINAIS = [
  ["cancel_antes_instalacao", "Cancel. antes da instalação"],
  ["cancel_30", "Cancel. em 30 dias"],
  ["churn_90", "Churn 90 dias"],
  ["inad_1a", "Inadimplência 1ª fatura"],
] as const;

function Celula({ ind }: { ind: Indicador }) {
  if (!ind.disponivel)
    return (
      <span className="text-xs text-muted-foreground" title={ind.formula}>
        {ROTULO_MOTIVO[ind.motivo ?? "em_maturacao"]}
        <span className="block tabular-nums">{ind.numerador ?? 0}/{ind.denominador ?? 0}</span>
      </span>
    );
  return (
    <span title={ind.formula}>
      <span className="font-medium tabular-nums">{fmtPct(ind.valor, 1)}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{ind.numerador}/{ind.denominador}</span>
    </span>
  );
}

export default async function QualidadePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const cfg = ap.base.cfg;
  const linhas = ap.linhas.filter((l) => l.vendedor.ativo || l.numeros.vendas > 0);
  const ids = new Set(linhas.map((l) => l.vendedor.id));
  const soma = (k: string) => linhas.reduce((s, l) => ({ c: s.c + (l.qualidade.indicadores[k].numerador ?? 0), b: s.b + (l.qualidade.indicadores[k].denominador ?? 0) }), { c: 0, b: 0 });
  const vendasPeriodo = ap.base.contratos.filter((c) => c.vendedor_id && ids.has(c.vendedor_id) && c.data_venda >= ctx.periodo.de && c.data_venda <= ctx.periodo.ate && ehVendaContavel(c as unknown as ContratoIndicador));
  const porPlano = new Map<string, number>();
  for (const c of vendasPeriodo) {
    const nome = c.plano_id ? (ap.base.planos.get(c.plano_id) ?? "Plano sem nome") : "Sem plano";
    porPlano.set(nome, (porPlano.get(nome) ?? 0) + 1);
  }
  // vendas com menos dias que a maturidade ainda não podem ser julgadas
  const corteMaturidade = new Date(Date.parse(`${ap.base.hoje}T12:00:00Z`) - cfg.qualidade.maturidade_dias * 86_400_000).toISOString().slice(0, 10);
  const maturando = vendasPeriodo.filter((c) => c.data_venda > corteMaturidade).length;

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />
      <p className="mb-3 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
        Coortes maduras relativas ao fim do período: vendas com {cfg.qualidade.maturidade_dias}+ dias (cancelamento antes da instalação), ativados há 30+ e 90+ dias (cancelamento e churn) e 1ªs faturas vencidas há 10+ dias — sempre numa janela de {cfg.qualidade.janela_dias} dias. Cancelamento, inadimplência e falha de instalação são sinais de investigação, nunca culpa automática do vendedor.
        {" "}Detalhe por safra em <Link href="/qualidade" className="text-interlig-azul hover:underline">Qualidade</Link>.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SINAIS.map(([k, r]) => {
          const x = soma(k);
          return <Kpi key={k} rotulo={r} valor={x.b >= cfg.volume_minimo.vendas_maduras ? fmtPct(x.c / x.b, 1) : "Em maturação"} contexto={`${x.c} de ${x.b} na coorte`} />;
        })}
        <Kpi rotulo="Vendas do período" valor={fmtNum(vendasPeriodo.length)} contexto={`${maturando} ainda em maturação`} />
        <Kpi rotulo="Receita mensal nova" valor={fmtBrl(vendasPeriodo.reduce((s, c) => s + c.valor_mensalidade, 0))} contexto={vendasPeriodo.length ? `ticket ${fmtBrl(vendasPeriodo.reduce((s, c) => s + c.valor_mensalidade, 0) / vendasPeriodo.length)}` : undefined} />
      </div>

      <Painel className="mt-4" titulo="Qualidade por vendedor" descricao="Cada sinal só pontua com volume maduro mínimo; sem ele aparece 'aguardando maturação' com o tamanho da coorte.">
        {linhas.length === 0 ? (
          <Vazio>Sem vendedores no escopo.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Vendedor</th>
                  <th className="py-2 text-right font-medium">Vendas</th>
                  <th className="py-2 text-right font-medium">Ticket médio</th>
                  {SINAIS.map(([, r]) => (
                    <th key={r} className="py-2 pl-3 font-medium">{r}</th>
                  ))}
                  <th className="py-2 text-right font-medium">Qualidade das vendas</th>
                  <th className="py-2 text-right font-medium">Atendimento (IA)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.vendedor.id} className="border-t align-top">
                    <td className="py-2.5 font-medium">{l.vendedor.nome}</td>
                    <td className="py-2.5 text-right tabular-nums">{l.numeros.vendas}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtBrl(l.numeros.ticketMedio)}</td>
                    {SINAIS.map(([k]) => (
                      <td key={k} className="py-2.5 pl-3"><Celula ind={l.qualidade.indicadores[k]} /></td>
                    ))}
                    <td className="py-2.5 text-right"><NotaScore valor={l.qualidade.indicadores.qualidade_vendas.nota} /></td>
                    <td className="py-2.5 text-right">
                      {l.qualidade.indicadores.qualidade_atendimento.nota === null ? (
                        <span className="text-xs text-muted-foreground">{ROTULO_MOTIVO[l.qualidade.indicadores.qualidade_atendimento.motivo ?? "sem_dados"]}</span>
                      ) : (
                        <NotaScore valor={l.qualidade.indicadores.qualidade_atendimento.nota} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Painel titulo="Planos vendidos no período" descricao="Planos reais do cadastro (nada de preço fixo no código).">
          {porPlano.size ? <BarrasSimples itens={[...porPlano.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([rotulo, valor]) => ({ rotulo, valor }))} /> : <Vazio>Sem vendas no período.</Vazio>}
        </Painel>
        <Painel titulo="Ainda não disponível" descricao="Dependem de integração que não existe hoje.">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Adesão a SVAs (Interlig Play, Mesh…) por venda.</li>
            <li>Upgrade e upsell da carteira atribuídos ao vendedor.</li>
            <li>Custo de aquisição (CAC) por canal e campanha.</li>
          </ul>
        </Painel>
      </div>
    </div>
  );
}
