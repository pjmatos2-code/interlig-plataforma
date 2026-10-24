import Link from "next/link";
import { BarrasSimples, FunilHorizontal } from "@/components/performance/barras";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtBrl, fmtNum, fmtNum1, fmtPct } from "@/components/performance/formato";
import { AvisoComparacao, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { indexar } from "@/lib/performance/dados/calcular";
import { calcularFunil, ROTULO_ORIGEM_LEAD, type ModoFunil } from "@/lib/performance/dados/funil";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";

export const dynamic = "force-dynamic";

export default async function FunilPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  const modo: ModoFunil = searchParams.modo === "fechamento" ? "fechamento" : "entrada";
  const origem = typeof searchParams.origem === "string" && ROTULO_ORIGEM_LEAD[searchParams.origem] ? searchParams.origem : null;
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const idx = indexar(ap.base);
  const ids = new Set(ap.linhas.map((l) => l.vendedor.id));
  const semDono = ctx.escopo.vendedorIds === null && !ctx.filtros.vendedorId && !ctx.filtros.coordenadorId && !ctx.filtros.setor;
  const noEscopo = (t: { vendedor_id: string | null; pop_id: string | null; origem_criacao: string }) =>
    (!origem || t.origem_criacao === origem) && (t.vendedor_id ? ids.has(t.vendedor_id) : semDono && (!ctx.filtros.popId || t.pop_id === ctx.filtros.popId));
  const f = calcularFunil(ap.base, idx, ctx.periodo.de, ctx.periodo.ate, noEscopo, modo);
  const porVendedor = ap.linhas
    .filter((l) => l.vendedor.ativo)
    .map((l) => ({ l, fv: calcularFunil(ap.base, idx, ctx.periodo.de, ctx.periodo.ate, (t) => t.vendedor_id === l.vendedor.id && (!origem || t.origem_criacao === origem), modo) }))
    .filter((x) => x.fv.total > 0);
  const qs = (m: Record<string, string | null>) => {
    const n = new URLSearchParams(Object.entries(searchParams).filter(([, v]) => typeof v === "string") as [string, string][]);
    for (const [k, v] of Object.entries(m)) (v === null ? n.delete(k) : n.set(k, v));
    return `?${n.toString()}`;
  };
  const conv = f.conversoes;

  return (
    <div>
      {ctx.escopo.papel !== "vendedor" && <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} vendedores={ctx.opcoes.vendedores} mostrar={{ pop: true, setor: true, coord: true, vendedor: true }} />}
      <AvisoComparacao texto={ap.avisoComparacao} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Coorte:</span>
        {[
          ["entrada", "Entrada (leads criados no período)"],
          ["fechamento", "Fechamento (leads fechados no período)"],
        ].map(([k, r]) => (
          <Link key={k} href={qs({ modo: k })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", modo === k ? "border-interlig-azul bg-interlig-azul text-white" : "hover:bg-muted")}>
            {r}
          </Link>
        ))}
        <span className="ml-2 text-xs font-medium text-muted-foreground">Origem:</span>
        {[null, ...Object.keys(ROTULO_ORIGEM_LEAD).filter((k) => k !== "sgp_auto")].map((k) => (
          <Link key={k ?? "todas"} href={qs({ origem: k })} className={cn("rounded-md border px-2.5 py-1 text-xs font-medium", origem === k ? "border-interlig-azul bg-interlig-azul/10 text-interlig-azul" : "hover:bg-muted")}>
            {k ? ROTULO_ORIGEM_LEAD[k] : "Todas"}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Painel titulo="Funil de vendas" descricao={`${fmtNum(f.total)} leads na coorte de ${modo === "entrada" ? "entrada" : "fechamento"}. Cada barra conta quem chegou pelo menos até a etapa.`}>
          {f.total ? <FunilHorizontal etapas={f.etapas} /> : <Vazio>Nenhum lead nesta coorte.</Vazio>}
        </Painel>
        <div className="space-y-4">
          <Painel titulo="Conversões entre etapas" descricao="Com o dado real de cada etapa (ex.: proposta → venda só conta leads com proposta registrada).">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["Lead → venda", conv.leadVenda],
                ["Qualificado → venda", conv.qualificadoVenda],
                ["Proposta → venda", conv.propostaVenda],
                ["Venda → instalação agendada", conv.vendaInstalacao],
                ["Instalação → ativação", conv.instalacaoAtivacao],
              ].map(([r, v]) => (
                <div key={String(r)} className="rounded-lg bg-muted/40 p-2.5">
                  <dt className="text-xs text-muted-foreground">{r}</dt>
                  <dd className="text-lg font-semibold">{fmtPct(v as number | null)}</dd>
                </div>
              ))}
              <div className="rounded-lg bg-muted/40 p-2.5">
                <dt className="text-xs text-muted-foreground">Leads recuperados</dt>
                <dd className="text-lg font-semibold">{f.recuperacao.recuperados}<span className="text-xs font-normal text-muted-foreground"> de {f.recuperacao.reabertos} reabertos</span></dd>
              </div>
            </dl>
          </Painel>
          <Painel titulo="Tempo entre etapas (mediana)">
            <ul className="space-y-2 text-sm">
              {f.tempos.map((t) => (
                <li key={t.chave} className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">{t.rotulo}</span>
                  <span className="tabular-nums">
                    {t.valor === null ? "—" : `${fmtNum1(t.valor)} ${t.unidade}`} <span className="text-xs text-muted-foreground">({t.amostra})</span>
                  </span>
                </li>
              ))}
            </ul>
          </Painel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Painel titulo="Onde os leads foram perdidos" descricao={`${fmtNum(f.perdas.total)} não convertidos, pela etapa em que pararam.`}>
          {f.perdas.porEtapa.length ? <BarrasSimples itens={f.perdas.porEtapa.map((p) => ({ rotulo: p.etapa, valor: p.quantidade }))} /> : <Vazio>Sem perdas na coorte.</Vazio>}
        </Painel>
        <Painel titulo="Motivos de perda" descricao="Motivo registrado no fechamento do ticket.">
          {f.perdas.porMotivo.length ? <BarrasSimples itens={f.perdas.porMotivo.slice(0, 10).map((p) => ({ rotulo: p.motivo, valor: p.quantidade }))} /> : <Vazio>Sem perdas na coorte.</Vazio>}
        </Painel>
        <Painel titulo="Eficiência por origem" descricao="Sem UTM, campanha ou custo integrados: CAC indisponível.">
          {f.porOrigem.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-medium">Origem</th>
                    <th className="py-1.5 text-right font-medium">Leads</th>
                    <th className="py-1.5 text-right font-medium">Vendas</th>
                    <th className="py-1.5 text-right font-medium">Conv.</th>
                    <th className="py-1.5 text-right font-medium">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {f.porOrigem.map((o) => (
                    <tr key={o.origem} className="border-t">
                      <td className="py-1.5">{o.origem}</td>
                      <td className="py-1.5 text-right tabular-nums">{o.leads}</td>
                      <td className="py-1.5 text-right tabular-nums">{o.vendas}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtPct(o.conversao)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtBrl(o.ticketMedio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vazio>Sem leads.</Vazio>
          )}
        </Painel>
      </div>

      <Painel className="mt-4" titulo="Funil por vendedor" descricao="Mesma coorte, só os leads de cada vendedor (responsável atual).">
        {porVendedor.length === 0 ? (
          <Vazio>Sem leads por vendedor nesta coorte.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Vendedor</th>
                  {["Recebidos", "Atendidos", "Qualificados", "Proposta", "Venda", "Ativados", "Lead → venda"].map((h) => (
                    <th key={h} className="py-2 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porVendedor.map(({ l, fv }) => (
                  <tr key={l.vendedor.id} className="border-t">
                    <td className="py-2 font-medium">{l.vendedor.nome}</td>
                    {[0, 2, 3, 4, 6, 8].map((i) => (
                      <td key={i} className="py-2 text-right tabular-nums">{fv.etapas[i].valor}</td>
                    ))}
                    <td className="py-2 text-right font-medium tabular-nums">{fmtPct(fv.conversoes.leadVenda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </div>
  );
}
