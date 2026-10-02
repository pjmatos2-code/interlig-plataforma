import Link from "next/link";
import { AlertTriangle, ArrowRight, ClipboardCheck, HeartHandshake, PenLine, Receipt, ShieldCheck, XCircle } from "lucide-react";
import type { PainelAtendimento } from "@/lib/agente/atendimento";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Bloco, ItemFoco, Kpi } from "@/components/agente/blocos";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";

const num = (v: number) => v.toLocaleString("pt-BR");
const dec = (v: number) => v.toFixed(1).replace(".", ",");
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function PainelAtendimentoAgente({
  p,
  baseSgp,
  semFidelidade,
  venceEm30,
}: {
  p: PainelAtendimento;
  baseSgp: string;
  semFidelidade: number;
  venceEm30: number;
}) {
  const tom = p.faixa ? "verde" : p.atingimento >= 70 ? "ambar" : "vermelho";
  const corTom = { verde: "bg-farol-verde", ambar: "bg-farol-amarelo", vermelho: "bg-farol-vermelho" }[tom];
  const textoTom = { verde: "text-farol-verde", ambar: "text-yellow-700", vermelho: "text-farol-vermelho" }[tom];
  const escala = Math.max(190, p.atingimento + 10);
  const pos = (v: number) => `${(Math.min(v, escala) / escala) * 100}%`;
  const linkAditivos = (sgpClienteId: string | null) =>
    baseSgp && sgpClienteId ? `${baseSgp.replace(/\/+$/, "").replace(/\/admin$/, "")}/admin/cliente/${sgpClienteId}/aditivos/` : null;
  const totalDias = p.dias.reduce((s, d) => s + d.validos, 0);
  const maxDia = Math.max(1, ...p.dias.map((d) => d.validos), (p.metaDiaMes ?? 0) * 1.4);
  const totalPlanos = p.planos.reduce((s, x) => s + x.quantidade, 0);
  const delta = p.hoje.hoje - p.hoje.anterior;

  return (
    <>
      {/* cartão de resultado */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-4 border-b px-5 py-4">
          <AvatarAgente nome={p.nome} foto={p.foto} tamanho="lg" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight">{p.nome}</p>
            <p className="text-sm text-muted-foreground">Atendimento · refidelização</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Comissão</p>
            <p className="text-3xl font-bold tabular-nums">{formatarMoeda(p.comissao)}</p>
            {p.comissaoSeAssinarem - p.comissao >= 0.01 && (
              <p className="text-xs text-muted-foreground">
                {formatarMoeda(p.comissaoSeAssinarem)} se os {p.aguardando.length} aguardando assinarem
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_1.25fr]">
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meta do mês</h3>
              <p className="flex items-end gap-2">
                <span className="text-2xl font-bold leading-none text-primary tabular-nums">{p.meta}</span>
                <span className="text-sm text-muted-foreground">planos refidelizados</span>
              </p>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aditivos do mês</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Gerados", p.gerados, "criados no SGP", ""],
                  ["Assinados", p.assinados, "cliente e provedor", ""],
                  ["Reprovados", p.reprovados, "pela gestão", p.reprovados > 0 ? "text-farol-vermelho" : ""],
                  ["Válidos", p.validos, "geram comissão", ""],
                ].map(([r, v, n, c], i) => (
                  <div key={r as string} className={cn("rounded-lg border px-3 py-2", i === 3 && "border-farol-verde/40 bg-farol-verde/5")}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r}</p>
                    <p className={cn("text-2xl font-bold leading-tight tabular-nums", c as string)}>{v}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{n}</p>
                  </div>
                ))}
              </div>
              {p.aguardando.length > 0 && (
                <p className="mt-2 text-xs">
                  <span className="font-semibold text-yellow-700">{p.aguardando.length} aguardando assinatura</span>
                  <span className="text-muted-foreground"> — contam quando o cliente e o provedor assinarem no SGPsign.</span>
                </p>
              )}
            </section>
          </div>
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atingimento</h3>
                <span className={cn("text-2xl font-bold tabular-nums", textoTom)}>{pct(p.atingimento)}</span>
              </div>
              <div className="relative pb-9 pt-1">
                <div className="h-4 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", corTom)} style={{ width: pos(p.atingimento) }} />
                </div>
                {p.faixas.map((f) => (
                  <div key={f.min} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pos(f.min) }}>
                    <span className="h-6 w-0.5 bg-foreground/60" />
                    <span className="mt-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums">{f.min}%</span>
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">{dec(f.pct)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-sm">
                <b className="tabular-nums">{p.validos}</b> válidos ÷ <b className="tabular-nums">{p.meta}</b> da meta ={" "}
                <b className="tabular-nums">{pct(p.atingimento)}</b>
                {p.faixa ? (
                  <> → faixa {p.faixa.nome.toLowerCase()} de <b>{dec(p.faixa.pct)}%</b></>
                ) : (
                  <span className="text-farol-vermelho"> → abaixo da faixa mínima</span>
                )}
              </p>
              {p.proximo && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.proximo.faltam === 1 ? "Falta 1 plano" : `Faltam ${p.proximo.faltam} planos`} para {p.proximo.faixa.min}% (faixa de{" "}
                  {dec(p.proximo.faixa.pct)}%)
                </p>
              )}
            </section>
            <section className="rounded-lg bg-muted/40 p-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como chegou na comissão</h3>
              {p.faixa ? (
                <p className="text-sm">
                  VTV refidelizado <b>{formatarMoeda(p.vtv)}</b> ({p.validos} planos) × <b>{dec(p.faixa.pct)}%</b> ={" "}
                  <b>{formatarMoeda(p.comissao)}</b>
                </p>
              ) : (
                <p className="text-sm">
                  Abaixo de {p.faixas[0].min}% da meta não há comissão — VTV refidelizado de {formatarMoeda(p.vtv)} fica sem faixa.
                </p>
              )}
            </section>
          </div>
        </div>
      </section>

      {/* indicadores */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icone={<ClipboardCheck className="h-5 w-5" />}
          tom="indigo"
          rotulo="Refidelizados hoje"
          valor={num(p.hoje.hoje)}
          rodape={
            <>
              {p.hoje.diaAnterior && (
                <span className={cn("font-medium", delta > 0 ? "text-farol-verde" : delta < 0 ? "text-farol-vermelho" : "")}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {p.hoje.anterior} no dia útil anterior
                </span>
              )}
              {p.hoje.metaDia !== null && <span className="block">meta do dia: {dec(p.hoje.metaDia)}</span>}
            </>
          }
        />
        <Kpi
          icone={<PenLine className="h-5 w-5" />}
          tom="ambar"
          rotulo="Aguardando assinatura"
          valor={num(p.aguardando.length)}
          href="#aguardando-assinatura"
          rodape={
            p.aguardandoParados > 0 ? (
              <span className="font-medium text-amber-600">{p.aguardandoParados} há mais de 3 dias</span>
            ) : (
              "nenhum parado há mais de 3 dias"
            )
          }
        />
        <Kpi
          icone={<XCircle className="h-5 w-5" />}
          tom="vermelho"
          rotulo="Reprovados"
          valor={num(p.reprovados)}
          rodape="com o motivo da gestão"
        />
        <Kpi
          icone={<Receipt className="h-5 w-5" />}
          tom="violeta"
          rotulo="VTV médio"
          valor={formatarMoeda(p.vtvMedio)}
          rodape="mensalidade média refidelizada"
        />
        <Kpi
          icone={<HeartHandshake className="h-5 w-5" />}
          tom="azul"
          rotulo="Sem fidelidade na base"
          valor={num(semFidelidade)}
          href="/fidelidade"
          rodape={`+${num(venceEm30)} vencem em até 30 dias`}
        />
      </div>

      {/* evolução + foco */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Bloco
          titulo="Evolução diária de refidelizações"
          extra={
            <span className="text-sm">
              <b className="text-primary">{num(totalDias)}</b> <span className="text-muted-foreground">válidos no mês</span>
            </span>
          }
        >
          <div className="relative h-44">
            {p.metaDiaMes !== null && (
              <div
                className="absolute inset-x-0 z-10 border-t-2 border-dashed border-farol-amarelo"
                style={{ bottom: `${(p.metaDiaMes / maxDia) * 100}%` }}
              />
            )}
            <div className="flex h-full items-end gap-[3px] border-b">
              {p.dias.map((d) => (
                <div
                  key={d.data}
                  className={cn("flex h-full flex-1 flex-col items-center justify-end rounded-t-sm", !d.util && "bg-muted/50")}
                  title={`${data(d.data)}: ${d.validos}`}
                >
                  {d.validos > 0 && <span className="mb-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{d.validos}</span>}
                  <div className="w-full rounded-t-sm bg-sky-500/80" style={{ height: `${(d.validos / maxDia) * 100}%`, minHeight: d.validos > 0 ? 3 : 0 }} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex gap-[3px]">
            {p.dias.map((d, i) => (
              <span key={d.data} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
                {i % 2 === 0 ? d.data.slice(8, 10) : ""}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500/80" /> válidos do dia</span>
            {p.metaDiaMes !== null && (
              <span className="flex items-center gap-1.5">
                <span className="w-4 border-t-2 border-dashed border-farol-amarelo" /> meta do dia ({dec(p.metaDiaMes)})
              </span>
            )}
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted" /> domingo e feriado</span>
          </div>
        </Bloco>

        <Bloco titulo="Foco do dia">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">Depende de você</p>
          <div className="space-y-1">
            {p.aguardandoParados > 0 && (
              <ItemFoco
                icone={<AlertTriangle className="h-4 w-4" />}
                tom="bg-amber-500/15 text-amber-600"
                titulo={`${p.aguardandoParados} ${p.aguardandoParados === 1 ? "cliente sem assinar" : "clientes sem assinar"} há mais de 3 dias`}
                texto="Reenvie o SGPsign: sem as duas assinaturas o aditivo não conta."
                href="#aguardando-assinatura"
              />
            )}
            {venceEm30 > 0 && (
              <ItemFoco
                icone={<HeartHandshake className="h-4 w-4" />}
                tom="bg-sky-500/10 text-sky-600"
                titulo={`${num(venceEm30)} clientes perdem a fidelidade em até 30 dias`}
                texto="Refidelize antes de vencer: o cliente ainda tem o desconto."
                href="/fidelidade"
              />
            )}
            {p.proximo && (
              <ItemFoco
                icone={<ArrowRight className="h-4 w-4" />}
                tom="bg-indigo-500/10 text-indigo-600"
                titulo={`${p.proximo.faltam === 1 ? "Falta 1 plano" : `Faltam ${p.proximo.faltam} planos`} para ${p.proximo.faixa.min}%`}
                texto={`Próxima faixa: ${dec(p.proximo.faixa.pct)}% do VTV refidelizado.`}
              />
            )}
            {p.aguardandoParados === 0 && venceEm30 === 0 && !p.proximo && (
              <p className="p-2 text-sm text-farol-verde">Tudo em dia por aqui.</p>
            )}
          </div>
          {p.emAnalise.length > 0 && (
            <>
              <p className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aguardando gestão</p>
              <ItemFoco
                icone={<ShieldCheck className="h-4 w-4" />}
                tom="bg-muted text-muted-foreground"
                titulo={`${p.emAnalise.length} ${p.emAnalise.length === 1 ? "aditivo de venda nova" : "aditivos de venda nova"} em análise`}
                texto="Contrato vendido no próprio mês: só conta com a aprovação da gestão."
              />
            </>
          )}
        </Bloco>
      </div>

      {/* planos + aguardando assinatura */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Bloco
          titulo="Planos refidelizados"
          extra={<span className="text-sm text-muted-foreground">VTV médio <b className="text-foreground">{formatarMoeda(p.vtvMedio)}</b></span>}
        >
          {totalPlanos === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum plano válido no mês ainda.</p>
          ) : (
            <div className="space-y-3">
              {p.planos.map((x, i) => (
                <div key={x.plano} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm" title={x.plano}>{x.plano}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn("h-full rounded-full", ["bg-sky-500", "bg-indigo-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-slate-400"][i % 6])}
                      style={{ width: `${(x.quantidade / totalPlanos) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-sm font-bold tabular-nums">{x.quantidade}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round((x.quantidade / totalPlanos) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <section id="aguardando-assinatura" className="scroll-mt-20 rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold">Aguardando assinatura</h2>
            <span className="text-sm text-muted-foreground">{p.aguardando.length} aditivo{p.aguardando.length === 1 ? "" : "s"}</span>
          </div>
          {p.aguardando.length === 0 ? (
            <p className="text-sm text-farol-verde">Nenhum aditivo esperando assinatura.</p>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">Cliente</th>
                    <th className="pb-2">Plano</th>
                    <th className="pb-2">Gerado em</th>
                    <th className="pb-2 text-right">SGP</th>
                  </tr>
                </thead>
                <tbody>
                  {[...p.aguardando]
                    .sort((a, b) => (a.data < b.data ? -1 : 1))
                    .map((l) => {
                      const link = linkAditivos(l.sgpClienteId);
                      const parado = Date.parse(`${l.data}T00:00:00Z`) <= Date.now() - 3 * 86_400_000;
                      return (
                        <tr key={l.id} className="border-t">
                          <td className="max-w-[200px] truncate py-1.5">{l.cliente}</td>
                          <td className="py-1.5 text-muted-foreground">{l.plano ?? "—"}</td>
                          <td className={cn("py-1.5 tabular-nums", parado && "font-semibold text-amber-600")}>{data(l.data)}</td>
                          <td className="py-1.5 text-right">
                            {link ? (
                              <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                                aditivos ↗
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="mt-4 text-sm">
        <Link href="/minha-comissao" className="text-primary hover:underline">
          Conferir todos os {p.gerados} aditivos do mês →
        </Link>
      </p>
    </>
  );
}
