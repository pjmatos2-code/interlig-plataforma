import { cn } from "@/lib/utils";
import type { LinhaQuebra } from "@/lib/grr/montar";

/**
 * Indicadores da equipe por agente (Reunião de Equipe): vendas contra a meta,
 * leads, conversão por safra, ticket médio, ativações, pendências, follow-ups
 * e perdas, com a semana anterior ao lado. Receita por agente fica de fora
 * (dado financeiro); o ticket médio é o indicador combinado para a equipe.
 */
const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const reais = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));

function Seta({ agora, antes, menorEMelhor = false }: { agora: number | null; antes: number | null; menorEMelhor?: boolean }) {
  if (agora == null || antes == null || agora === antes) return null;
  const sobe = agora > antes;
  const bom = menorEMelhor ? !sobe : sobe;
  return (
    <span className={cn("ml-1 text-[0.8em]", bom ? "text-green-700" : "text-red-700")} aria-label={sobe ? "subiu" : "caiu"}>
      {sobe ? "▲" : "▼"}
    </span>
  );
}

export function TabelaEquipe({ linhas, grande = false }: { linhas: LinhaQuebra[]; grande?: boolean }) {
  const th = cn("py-2 font-medium text-slate-500", grande ? "text-sm" : "text-xs");
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full tabular-nums", grande ? "min-w-[64rem] text-base" : "min-w-[60rem] text-sm")}>
        <thead>
          <tr className="border-b text-left">
            <th className={th}>Agente</th>
            <th className={cn(th, "text-right")}>Vendas semana</th>
            <th className={cn(th, "text-right")}>Mês / meta</th>
            <th className={cn(th, "text-right")}>Leads receb. / atend.</th>
            <th className={cn(th, "text-right")}>Conversão</th>
            <th className={cn(th, "text-right")}>Ticket</th>
            <th className={cn(th, "text-right")}>Ativadas</th>
            <th className={cn(th, "text-right")}>Sem assinar</th>
            <th className={cn(th, "text-right")}>Aguard. instalação</th>
            <th className={cn(th, "text-right")}>Follow-up vencido</th>
            <th className={cn(th, "text-right")}>Perdidos</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const o = l.operacional;
            return (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 font-medium">{l.nome}</td>
                <td className="text-right font-semibold">
                  {n(l.vendas)}
                  <Seta agora={l.vendas} antes={o?.anterior.vendas ?? l.vendasAnterior} />
                  <span className="block text-xs font-normal text-slate-500">ant. {n(o?.anterior.vendas ?? l.vendasAnterior)}</span>
                </td>
                <td className="text-right">
                  {n(l.vendasMes)}
                  {l.metaMes ? <span className="text-slate-500"> / {n(l.metaMes)}</span> : <span className="text-slate-400"> / —</span>}
                </td>
                <td className="text-right">
                  {n(l.recebidos)} / {n(l.atendidos)}
                </td>
                <td className="text-right">
                  {pct(l.safraTaxa)}
                  <Seta agora={l.safraTaxa} antes={o?.anterior.conversaoSafra ?? null} />
                  <span className="block text-xs text-slate-500">
                    {n(l.safraConvertidos)} de {n(l.safraAtendidos)}
                  </span>
                </td>
                <td className="text-right">
                  {reais(l.ticket)}
                  <Seta agora={l.ticket} antes={o?.anterior.ticket ?? null} />
                </td>
                <td className="text-right">{n(l.ativacoes)}</td>
                <td className={cn("text-right", (o?.semAssinar48h ?? 0) > 0 && "font-semibold text-red-700")}>
                  {o ? n(o.semAssinar) : "—"}
                  {o && o.semAssinar48h > 0 && <span className="block text-xs">{n(o.semAssinar48h)} há 48h+</span>}
                </td>
                <td className="text-right">
                  {o ? n(o.aguardandoInstalacao) : "—"}
                  {o && o.paradasMais7Dias > 0 && <span className="block text-xs text-red-700">{n(o.paradasMais7Dias)} paradas 7d+</span>}
                </td>
                <td className={cn("text-right", (o?.retornosVencidos ?? 0) > 0 && "font-semibold text-red-700")}>
                  {o ? n(o.retornosVencidos) : "—"}
                  {o && <span className="block text-xs font-normal text-slate-500">{n(o.retornosPendentes)} a fazer</span>}
                </td>
                <td className="text-right">
                  {n(l.perdidos)}
                  {o?.motivos[0] && <span className="block max-w-[10rem] truncate text-xs text-slate-500 sm:ml-auto">{o.motivos[0].motivo}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
