import Link from "next/link";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { GraficoHoras } from "@/components/performance/graficos";
import { AvisoComparacao, ComposicaoScore, NotaScore, Painel, ValorIndicador, Vazio } from "@/components/performance/ui";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { rotuloSetor } from "@/lib/performance/dados/calcular";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";

export const dynamic = "force-dynamic";

const COLUNAS: { k: string; rotulo: string; nota?: boolean }[] = [
  { k: "leads_recebidos", rotulo: "Leads recebidos" },
  { k: "leads_trabalhados", rotulo: "Trabalhados" },
  { k: "leads_atendidos", rotulo: "% atendidos", nota: true },
  { k: "tempo_primeira_resposta", rotulo: "1ª resposta (mediana)" },
  { k: "sla_primeira_resposta", rotulo: "No SLA", nota: true },
  { k: "tempo_entre_interacoes", rotulo: "Entre interações" },
  { k: "conversas_trabalhadas", rotulo: "Conversas trabalhadas", nota: true },
  { k: "followups_previstos", rotulo: "Follow-ups previstos" },
  { k: "followups_realizados", rotulo: "Realizados" },
  { k: "followups_prazo", rotulo: "No prazo", nota: true },
  { k: "leads_sem_retorno", rotulo: "Sem retorno" },
  { k: "propostas", rotulo: "Propostas", nota: true },
  { k: "recuperacao", rotulo: "Recuperados", nota: true },
  { k: "disciplina_crm", rotulo: "Disciplina CRM", nota: true },
  { k: "mensagens_enviadas", rotulo: "Msgs enviadas" },
  { k: "mensagens_recebidas", rotulo: "Msgs recebidas" },
  { k: "ligacoes", rotulo: "Ligações" },
];

export default async function EsforcoPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const linhas = ap.linhas.filter((l) => l.vendedor.ativo || l.numeros.leadsTrabalhados > 0);
  const ids = linhas.map((l) => l.vendedor.id);
  const { data: horas } = await criarClienteAdmin().rpc("performance_mensagens_por_hora", {
    p_de: `${ctx.periodo.de}T00:00:00-03:00`,
    p_ate: `${ctx.periodo.ate}T23:59:59.999-03:00`,
    p_vendedores: ids.length ? ids : ["00000000-0000-0000-0000-000000000000"],
  });
  const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, clientes: 0, equipe: 0 }));
  for (const r of (horas ?? []) as { hora: number; autor: string; qtd: number }[]) {
    if (r.autor === "cliente") porHora[r.hora].clientes += Number(r.qtd);
    else porHora[r.hora].equipe += Number(r.qtd);
  }
  const faixaHoras = porHora.filter((h) => h.hora >= 6 && h.hora <= 22);
  const qs = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]).toString();

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />

      <AvisoComparacao texto={ap.avisoComparacao} />
      <Painel
        titulo="Indicadores de esforço por vendedor"
        descricao="Só ações humanas contam (automação do chat nunca é esforço do vendedor). Item sem dado aparece com o motivo e não vale zero. Mensagens são contexto, não pontuam."
      >
        {linhas.length === 0 ? (
          <Vazio>Sem vendedores no escopo selecionado.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card py-2 pr-3 font-medium">Vendedor</th>
                  <th className="py-2 pr-3 text-right font-medium">Esforço</th>
                  {COLUNAS.map((c) => (
                    <th key={c.k} className="py-2 pr-3 font-medium">{c.rotulo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.vendedor.id} className="border-t align-top">
                    <td className="sticky left-0 z-10 bg-card py-2.5 pr-3">
                      <Link href={`/performance/vendedor/${l.vendedor.id}?${qs}`} className="font-medium hover:underline">{l.vendedor.nome}</Link>
                      <span className="block text-xs text-muted-foreground">{rotuloSetor(l.vendedor.setor)}{l.flags.temCanalChat ? " · chat" : ""}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right"><NotaScore valor={l.esforco.score.valor} provisorio={l.esforco.score.provisorio} /></td>
                    {COLUNAS.map((c) => {
                      const ind = l.esforco.indicadores[c.k];
                      return (
                        <td key={c.k} className="py-2.5 pr-3" title={ind?.formula}>
                          {ind ? <ValorIndicador ind={ind} mostrarNota={c.nota} /> : "—"}
                          {ind?.detalhe && ind.disponivel && <span className="block max-w-[11rem] text-[11px] text-muted-foreground">{ind.detalhe}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Painel
          titulo="Distribuição do atendimento ao longo do dia"
          descricao="Mensagens de clientes (demanda) e mensagens humanas da equipe por hora, no período. Mostra concentração de demanda — não mede presença nem produtividade individual."
        >
          {faixaHoras.some((h) => h.clientes + h.equipe > 0) ? <GraficoHoras dados={faixaHoras} /> : <Vazio>Sem mensagens coletadas no período.</Vazio>}
        </Painel>
        <Painel titulo="Como cada nota foi formada" descricao="Abra um vendedor para ver valor, peso, peso efetivo e pontos de cada item.">
          <div className="space-y-2">
            {linhas.filter((l) => l.esforco.score.valor !== null).map((l) => (
              <ComposicaoScore key={l.vendedor.id} titulo={l.vendedor.nome} score={l.esforco.score} indicadores={l.esforco.indicadores} />
            ))}
            {linhas.every((l) => l.esforco.score.valor === null) && <Vazio>Nenhum vendedor com dados de esforço no período.</Vazio>}
          </div>
        </Painel>
      </div>
    </div>
  );
}
