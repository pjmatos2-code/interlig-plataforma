import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarEquipeMeuDia } from "@/lib/meu-dia/dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Meu Dia — visão do gestor (14/10/2026): por vendedora, o que está aberto
 * em cada bloco, o que foi concluído hoje e a meta do dia × realizado.
 */
export default async function MeuDiaEquipePage({ searchParams }: { searchParams: { pop?: string } }) {
  await exigirPerfil(["gestor"]);
  const { data: popsPiloto } = await criarClienteAdmin()
    .from("vendedores")
    .select("pop_id, pops(nome)")
    .eq("meu_dia", true)
    .eq("ativo", true);
  const unidades = [...new Map((popsPiloto ?? []).filter((p) => p.pop_id).map((p) => [p.pop_id as string, (p.pops as unknown as { nome: string } | null)?.nome ?? "—"])).entries()];
  const pop = unidades.some(([id]) => id === searchParams.pop) ? searchParams.pop! : null;
  const equipe = await carregarEquipeMeuDia(pop);
  const hoje = equipe[0]?.hoje;

  return (
    <>
      <CabecalhoPagina
        titulo="Meu Dia da equipe"
        descricao={`Missões abertas por vendedora, o que foi feito hoje${hoje ? ` (${hoje.split("-").reverse().join("/")})` : ""} e a meta do dia. Atualiza a cada acesso.`}
      />
      {unidades.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <a href="/meu-dia/equipe" className={cn("rounded-full border px-3 py-1 text-xs font-medium", !pop ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            Todas as unidades
          </a>
          {unidades.map(([id, nome]) => (
            <a key={id} href={`/meu-dia/equipe?pop=${id}`} className={cn("rounded-full border px-3 py-1 text-xs font-medium", pop === id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {nome}
            </a>
          ))}
        </div>
      )}

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Vendedora</th>
                <th className="px-3 py-3 text-right font-semibold">1 · Leads</th>
                <th className="px-3 py-3 text-right font-semibold">2 · Follow-up</th>
                <th className="px-3 py-3 text-right font-semibold">3 · Esteira</th>
                <th className="px-3 py-3 text-right font-semibold">4 · Pós-venda</th>
                <th className="px-3 py-3 text-right font-semibold">5 · A repor</th>
                <th className="px-3 py-3 text-right font-semibold">Feitas hoje</th>
                <th className="px-3 py-3 font-semibold">Conclusão do dia</th>
                <th className="px-3 py-3 text-right font-semibold">Hoje × meta do dia</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {equipe.map((d) => {
                const fu = d.followup;
                const totalFu = fu.atrasado.length + fu.hoje.length + fu.urgencia.length + fu.parada.length;
                const pct = d.abertos + d.concluidosHoje > 0 ? Math.round((d.concluidosHoje / (d.abertos + d.concluidosHoje)) * 100) : 100;
                const n = (v: number, alerta = false) => (
                  <span className={cn("tabular-nums", v === 0 ? "text-muted-foreground" : alerta ? "font-semibold text-farol-vermelho" : "font-semibold")}>{v}</span>
                );
                return (
                  <tr key={d.vendedorId} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{d.nome}</p>
                      <p className="text-xs text-muted-foreground">{d.pop ?? "—"}</p>
                    </td>
                    <td className="px-3 py-3 text-right">{n(d.leads.length, d.leads.length > 0)}</td>
                    <td className="px-3 py-3 text-right">
                      {n(totalFu, fu.atrasado.length > 0)}
                      {totalFu > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {[
                            fu.atrasado.length && `${fu.atrasado.length} atras.`,
                            fu.hoje.length && `${fu.hoje.length} hoje`,
                            fu.urgencia.length && `${fu.urgencia.length} IA`,
                            fu.parada.length && `${fu.parada.length} parad.`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">{n(d.esteira.length)}</td>
                    <td className="px-3 py-3 text-right">{n(d.posvenda.length)}</td>
                    <td className="px-3 py-3 text-right">{n(d.pendentes90.total)}</td>
                    <td className="px-3 py-3 text-right">{n(d.concluidosHoje)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <span className={cn("block h-full rounded-full", pct >= 80 ? "bg-farol-verde" : pct >= 40 ? "bg-amber-400" : "bg-farol-vermelho")} style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-xs tabular-nums">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {d.meta.metaMes === 0 ? (
                        <span className="text-xs text-muted-foreground">sem meta</span>
                      ) : d.meta.batida ? (
                        <span className="text-xs font-semibold text-farol-verde">meta do mês batida</span>
                      ) : (
                        <span className={cn("tabular-nums font-semibold", d.meta.realizadoHoje >= d.meta.metaDia ? "text-farol-verde" : "")}>
                          {d.meta.realizadoHoje} / {d.meta.metaDia}
                        </span>
                      )}
                      <span className="block text-[11px] text-muted-foreground">
                        mês {d.meta.realizadoMes}/{d.meta.metaMes} · {d.meta.pct}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link href={`/meu-dia?vendedor=${d.vendedorId}`} className="whitespace-nowrap text-xs font-medium text-interlig-azul hover:underline">
                        Abrir o dia →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {equipe.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma vendedora no piloto do Meu Dia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-3 text-xs text-muted-foreground">
        Feitas hoje = ações registradas no dia (tratativas, retornos, lembretes, follow-ups da IA, fechamentos e pós-venda).
        Conclusão = feitas ÷ (feitas + abertas).
      </p>
    </>
  );
}
