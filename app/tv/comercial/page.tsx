import type { ReactNode } from "react";
import { Building2, CircleDollarSign, Gauge, Headset, ShoppingCart, Tag, Target, UserPlus } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { carregarTvComercial } from "@/lib/tv/comercial";
import { LogoInterlig } from "@/components/marca/logo-interlig";
import { cn } from "@/lib/utils";
import { AlertaNovaVenda, AutoAtualizar, PalcoTv, Relogio } from "./cliente";

export const dynamic = "force-dynamic";

const moeda = (v: number, casas = 2) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const num = (v: number) => v.toLocaleString("pt-BR");

function Delta({ hoje, antes }: { hoje: number; antes: number }) {
  if (antes === 0) return <span className="text-sm text-slate-400">sem base de comparação</span>;
  const pct = Math.round(((hoje - antes) / antes) * 100);
  const sobe = pct >= 0;
  return (
    <span className={cn("text-lg font-bold", sobe ? "text-emerald-400" : "text-rose-400")}>
      {sobe ? "▲" : "▼"} {sobe ? "+" : ""}
      {pct}%
    </span>
  );
}

function Kpi({
  icone,
  cor,
  rotulo,
  valor,
  rodape,
  tom = "padrao",
}: {
  icone: ReactNode;
  cor: string;
  rotulo: string;
  valor: string;
  rodape: ReactNode;
  tom?: "padrao" | "verde" | "roxo" | "ambar";
}) {
  const borda = {
    padrao: "border-sky-500/25",
    verde: "border-emerald-500/30",
    roxo: "border-violet-500/30",
    ambar: "border-amber-400/35",
  }[tom];
  return (
    <div className={cn("flex items-center gap-5 rounded-2xl border bg-[#0d1b3d]/[0.86] px-6 py-3", borda)}>
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full" style={{ background: cor }}>
        {icone}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold tracking-widest text-slate-300">{rotulo}</p>
        <p className="text-4xl font-black tabular-nums leading-tight text-white">{valor}</p>
        <div className="truncate whitespace-nowrap text-sm text-slate-400">{rodape}</div>
      </div>
    </div>
  );
}

function Painel({ titulo, sub, children, className }: { titulo: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-sky-500/20 bg-[#0d1b3d]/[0.86] px-4 py-3", className)}>
      <h2 className="text-lg font-bold tracking-wide text-white">{titulo}</h2>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-center">{children}</div>
    </section>
  );
}

/** Velocímetro semicircular: vendas do dia ÷ meta diária. */
function Velocimetro({ valor, meta, className }: { valor: number; meta: number; className?: string }) {
  const pct = meta > 0 ? Math.min(1, valor / meta) : 0;
  const comprimento = Math.PI * 90;
  return (
    <svg viewBox="0 0 220 125" className={cn("w-full max-w-[220px]", className)}>
      <path d="M20 115 A90 90 0 0 1 200 115" fill="none" stroke="#1e2f57" strokeWidth="18" strokeLinecap="round" />
      <path
        d="M20 115 A90 90 0 0 1 200 115"
        fill="none"
        stroke="#2f8cff"
        strokeWidth="18"
        strokeLinecap="round"
        strokeDasharray={`${comprimento * pct} ${comprimento}`}
      />
      <text x="110" y="88" textAnchor="middle" className="fill-white" style={{ fontSize: 38, fontWeight: 900 }}>
        {valor}
      </text>
      <text x="110" y="108" textAnchor="middle" style={{ fontSize: 11, fill: "#cbd5e1", letterSpacing: 1 }}>
        VENDAS HOJE
      </text>
    </svg>
  );
}

export default async function TvComercialPage({
  searchParams,
}: {
  searchParams: { alerta?: string; som?: string; demo?: string; mes?: string };
}) {
  // visão da empresa inteira: mesmo público do dashboard principal
  await exigirPerfil(["gestor", "supervisor", "direcao"]);
  // padrão aprovado (01/10/2026): símbolo da marca + moedas; a URL ainda
  // permite trocar (?alerta=sino&som=conexao)
  const estilo = searchParams.alerta === "sino" ? "sino" : "marca";
  const som = (["sino", "conexao", "moedas"].includes(searchParams.som ?? "") ? searchParams.som : "moedas") as
    | "sino"
    | "conexao"
    | "moedas";
  const d = await carregarTvComercial({ mes: searchParams.mes });

  const pctMetaDia = d.metaDiaria > 0 ? Math.round((d.vendas.hoje / d.metaDiaria) * 100) : 0;
  const pctGeral = (d.metaGeral.ativos / d.metaGeral.meta) * 100;
  const faltam = Math.max(0, d.metaGeral.meta - d.metaGeral.ativos);
  const ritmoHora = d.metaDiaria / 12;
  const maxHora = Math.max(1, ritmoHora * 1.3, ...d.porHora.map((h) => h.vendas));
  const maxFunil = Math.max(1, d.funil.leads, d.funil.atendimento, d.funil.assinado);
  const maxMes = Math.max(1, ...d.mes.unidades.map((u) => u.vendas));
  const totalMes = d.mes.unidades.reduce((t, u) => t + u.vendas, 0);
  const metaMes = d.mes.unidades.reduce((t, u) => t + u.meta, 0);
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const nomeMes = `${MESES[Number(d.mes.referencia.slice(5, 7)) - 1]} de ${d.mes.referencia.slice(0, 4)}`;
  const COR_UNIDADE: Record<string, string> = {
    Altamira: "#2f8cff",
    "Vitória do Xingu": "#22d3a6",
    "Brasil Novo": "#f59e0b",
  };

  return (
    <>
    {/* fora do palco escalado: o alerta ocupa a TV inteira */}
    <AlertaNovaVenda
      vendas={d.vendasRecentes}
      totalHoje={d.vendas.hoje}
      metaDiaria={d.metaDiaria}
      estilo={estilo}
      som={som}
      demo={searchParams.demo === "1"}
    />
    <PalcoTv>
    <main className="flex h-full flex-col px-8 py-4 text-white">
      <AutoAtualizar />

      {/* cabeçalho */}
      <header className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-5">
          <LogoInterlig variante="clara" tamanho="md" />
          <p className="border-l border-white/20 pl-5 text-sm font-semibold leading-snug tracking-[0.3em] text-slate-300">
            TUDO DE ON
            <br />
            PRA VOCÊ.
          </p>
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[0.12em]">DASHBOARD COMERCIAL</h1>
          <p className="text-sm tracking-[0.35em] text-slate-300">VENDAS · METAS · RESULTADOS EM TEMPO REAL</p>
        </div>
        <Relogio />
      </header>

      {/* KPIs */}
      <div className="grid shrink-0 grid-cols-5 gap-4">
        <Kpi
          icone={<ShoppingCart className="h-8 w-8 text-white" />}
          cor="#1d6ff2"
          rotulo="VENDAS HOJE"
          valor={num(d.vendas.hoje)}
          rodape={<><Delta hoje={d.vendas.hoje} antes={d.vendas.antes} /> vs. dia útil anterior</>}
        />
        <Kpi
          tom="verde"
          icone={<CircleDollarSign className="h-8 w-8 text-white" />}
          cor="#0f9f6e"
          rotulo="RECEITA HOJE"
          valor={moeda(d.receita.hoje, 0)}
          rodape={<><Delta hoje={d.receita.hoje} antes={d.receita.antes} /> vs. dia útil anterior</>}
        />
        <Kpi
          tom="roxo"
          icone={<Tag className="h-8 w-8 text-white" />}
          cor="#7c3aed"
          rotulo="TICKET MÉDIO"
          valor={moeda(d.ticket.hoje)}
          rodape={<><Delta hoje={d.ticket.hoje} antes={d.ticket.antes} /> vs. dia útil anterior</>}
        />
        {/* vendas do dia × meta diária (ocupa o espaço de dois cards) */}
        <div className="col-span-2 flex items-center gap-6 rounded-2xl border border-sky-500/25 bg-[#0d1b3d]/[0.86] px-6 py-2">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1d6ff2]">
            <Gauge className="h-8 w-8 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-widest text-slate-300">VENDAS DO DIA × META</p>
            <p className="text-sm text-slate-400">Meta diária: <b className="text-white">{Math.round(d.metaDiaria)}</b></p>
          </div>
          <Velocimetro valor={d.vendas.hoje} meta={d.metaDiaria} className="ml-auto h-[92px] w-auto" />
          <div className="text-center">
            <p className="text-5xl font-black tabular-nums text-sky-400">{pctMetaDia}%</p>
            <p className="text-sm text-slate-300">da meta</p>
          </div>
        </div>
      </div>

      {/* META GERAL 2026 */}
      <section className="mt-3 flex shrink-0 items-center gap-8 rounded-2xl border border-sky-400/40 bg-[#0b1f4a]/[0.86] px-7 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <Target className="h-8 w-8 text-sky-400" />
            <div>
              <p className="text-xl font-black tracking-wide">META GERAL 2026 · ATINGIMENTO</p>
              <p className="text-sm text-slate-300">Base total de ativos (todas as unidades)</p>
            </div>
          </div>
          <div className="mt-2 flex items-end gap-6">
            <p className="text-4xl font-black tabular-nums">
              {num(d.metaGeral.ativos)}
              <span className="ml-3 text-lg font-medium text-slate-300">
                ativos hoje · {pctGeral.toFixed(1).replace(".", ",")}% da meta
              </span>
            </p>
            <div className="flex-1">
              <p className="mb-1 text-right text-lg font-black text-amber-300">
                Faltam {num(faltam)} <span className="text-xs font-normal text-slate-400">até 31/12/2026</span>
              </p>
              <div className="h-4 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2f8cff] to-[#22d3a6]"
                  style={{ width: `${Math.min(100, pctGeral)}%` }}
                />
              </div>
              <div className="mt-2 flex gap-3">
                {d.metaGeral.unidades.map((u) => (
                  <span key={u.nome} className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_UNIDADE[u.nome] }} />
                    {u.nome}: <b className="tabular-nums">{num(u.ativos)}</b>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-4 divide-x divide-white/15 border-l border-white/15 pl-6 text-center">
          {[
            ["META ANUAL", num(d.metaGeral.meta), "ativos", "text-white"],
            ["ATUAIS", num(d.metaGeral.ativos), "ativos", "text-white"],
            ["% ATINGIDO", `${pctGeral.toFixed(1).replace(".", ",")}%`, "", "text-emerald-400"],
            ["RESTANTE", num(faltam), "ativos", "text-amber-300"],
          ].map(([r, v, s, c]) => (
            <div key={r} className="px-5">
              <p className="text-xs font-semibold tracking-wider text-slate-400">{r}</p>
              <p className={cn("text-3xl font-black tabular-nums", c)}>{v}</p>
              <p className="text-xs text-slate-400">{s}</p>
            </div>
          ))}
        </div>
      </section>

      {/* linha 3: vendas do mês por unidade · evolução por hora · funil */}
      <div className="mt-3 grid flex-[0.9] grid-cols-[1fr_1.7fr_1.1fr] gap-4">
        <Painel titulo="VENDAS NO MÊS POR UNIDADE" sub={nomeMes[0].toUpperCase() + nomeMes.slice(1)}>
          <div className="space-y-2.5">
            {d.mes.unidades.map((u) => (
              <div key={u.nome} className="flex items-center gap-3">
                <span className="flex w-40 shrink-0 items-center gap-2 text-sm text-slate-200">
                  <Building2 className="h-5 w-5" style={{ color: COR_UNIDADE[u.nome] }} /> {u.nome}
                </span>
                <div className="h-8 flex-1 rounded-md bg-white/5">
                  <div
                    className="flex h-full min-w-[3.5rem] items-center justify-center rounded-md"
                    style={{ width: `${(u.vendas / maxMes) * 100}%`, background: COR_UNIDADE[u.nome] }}
                  >
                    <span className="text-2xl font-black tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
                      {u.vendas}
                    </span>
                  </div>
                </div>
                <span className="w-16 text-right text-sm tabular-nums text-slate-300">
                  {u.meta > 0 ? `${Math.round((u.vendas / u.meta) * 100)}%` : "—"}
                  <span className="block text-xs text-slate-500">meta {u.meta || "—"}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2">
            <span className="text-sm font-semibold tracking-wide text-sky-200">TOTAL VENDIDO NO MÊS</span>
            <span className="flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums text-sky-300">{num(totalMes)}</span>
              {metaMes > 0 && (
                <span className="text-xs text-slate-300">
                  de {num(metaMes)} · {Math.round((totalMes / metaMes) * 100)}% da meta
                </span>
              )}
            </span>
          </div>
        </Painel>

        <Painel titulo="EVOLUÇÃO DIÁRIA DE VENDAS">
          <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#2f8cff]" /> Vendas realizadas
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 border-t-2 border-dashed border-slate-300" /> Ritmo da meta por hora
              </span>
            </span>
            <span className="text-right">
              <span className="block text-xs text-slate-400">META DO DIA</span>
              <span className="text-3xl font-black text-sky-300">{Math.round(d.metaDiaria)}</span>
            </span>
          </div>
          <div className="relative min-h-[6.5rem] flex-1">
            <div
              className="absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-400/70"
              style={{ bottom: `${(ritmoHora / maxHora) * 100}%` }}
            />
            <div className="flex h-full items-end gap-2 border-b border-white/15">
              {d.porHora.map((h) => (
                <div key={h.hora} className="flex h-full flex-1 flex-col items-center justify-end">
                  {h.vendas > 0 && <span className="mb-1 text-sm font-bold">{h.vendas}</span>}
                  <div
                    className="w-3/5 rounded-t-md bg-[#2f8cff]"
                    style={{ height: `${(h.vendas / maxHora) * 100}%`, minHeight: h.vendas > 0 ? 6 : 0 }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex gap-2">
            {d.porHora.map((h) => (
              <span key={h.hora} className="flex-1 text-center text-xs text-slate-400">
                {h.hora}h
              </span>
            ))}
          </div>
        </Painel>

        <Painel titulo="FUNIL DO DIA">
          <div className="space-y-2.5">
            {[
              { r: "Leads", v: d.funil.leads, ic: <UserPlus className="h-5 w-5" />, c: "#2f8cff" },
              { r: "Em atendimento", v: d.funil.atendimento, ic: <Headset className="h-5 w-5" />, c: "#22a7f0" },
              { r: "Contrato assinado", v: d.funil.assinado, ic: <ShoppingCart className="h-5 w-5" />, c: "#22d3a6" },
            ].map((f) => (
              <div key={f.r} className="flex items-center gap-3">
                <span className="w-44 shrink-0 items-center gap-2 text-sm text-slate-200 flex">
                  <span style={{ color: f.c }}>{f.ic}</span> {f.r}
                </span>
                <div className="h-7 flex-1 rounded-md bg-white/5">
                  <div className="h-full rounded-md" style={{ width: `${(f.v / maxFunil) * 100}%`, background: f.c }} />
                </div>
                <span className="w-10 text-right text-2xl font-black tabular-nums">{f.v}</span>
              </div>
            ))}
          </div>
          {/* conversão do dia = contratos assinados ÷ leads do dia */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2">
            <span className="text-sm font-semibold tracking-wide text-emerald-200">TAXA DE CONVERSÃO DO DIA</span>
            <span className="flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums text-emerald-400">
                {d.funil.leads > 0 ? Math.round((d.funil.assinado / d.funil.leads) * 100) : 0}%
              </span>
              <span className="text-xs text-slate-300">
                {d.funil.assinado} de {d.funil.leads} leads
              </span>
            </span>
          </div>
        </Painel>
      </div>

      {/* linha 4: top 5 · unidades */}
      <div className="mt-3 grid flex-1 grid-cols-[1fr_1.6fr] gap-4">
        <Painel titulo="TOP 5 AGENTES HOJE">
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-xs tracking-wider text-slate-400">
                <th className="w-10 pb-2">#</th>
                <th className="pb-2">AGENTE</th>
                <th className="pb-2 text-right">VENDAS</th>
                <th className="pb-2 text-right">RECEITA</th>
              </tr>
            </thead>
            <tbody>
              {d.top5.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
                    Ainda sem vendas hoje
                  </td>
                </tr>
              )}
              {d.top5.map((a, i) => (
                <tr key={a.nome} className="border-t border-white/5">
                  <td className="py-1">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-sm font-black",
                        i === 0 ? "bg-amber-400 text-amber-950" : i === 1 ? "bg-slate-300 text-slate-800" : i === 2 ? "bg-orange-500 text-orange-950" : "bg-white/10 text-slate-300"
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-1">
                    <span className="flex items-center gap-3">
                      {a.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.foto} alt="" className="h-8 w-8 rounded-full border-2 border-sky-400/60 object-cover" />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-sky-400/60 bg-sky-900 text-base font-bold text-sky-200">
                          {a.nome[0]}
                        </span>
                      )}
                      <span className="text-lg font-semibold">{a.nome}</span>
                    </span>
                  </td>
                  <td className="py-1 text-right text-xl font-black tabular-nums">{a.vendas}</td>
                  <td className="py-1 text-right tabular-nums text-slate-200">{moeda(a.receita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Painel>

        <Painel titulo="RESULTADO POR UNIDADE (HOJE)">
          <table className="w-full text-base">
            <thead>
              <tr className="text-left text-xs tracking-wider text-slate-400">
                <th className="pb-2">UNIDADE</th>
                <th className="pb-2 text-right">VENDAS</th>
                <th className="pb-2 text-right">RECEITA</th>
                <th className="pb-2 text-right">META (DIA)</th>
                <th className="w-[28%] pb-2 pl-6">ATINGIMENTO</th>
              </tr>
            </thead>
            <tbody>
              {d.unidades.map((u) => {
                const pct = u.metaDia > 0 ? Math.round((u.vendas / u.metaDia) * 100) : 0;
                return (
                  <tr key={u.nome} className="border-t border-white/5">
                    <td className="py-2 font-semibold">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COR_UNIDADE[u.nome] }} />
                      {u.nome}
                    </td>
                    <td className="py-2 text-right text-xl font-black tabular-nums">{u.vendas}</td>
                    <td className="py-2 text-right tabular-nums">{moeda(u.receita, 0)}</td>
                    <td className="py-2 text-right tabular-nums">{u.metaDia.toFixed(1).replace(".", ",")}</td>
                    <td className="py-2 pl-6">
                      <span className="flex items-center gap-3">
                        <span className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                          <span
                            className="block h-full rounded-full"
                            style={{ width: `${Math.min(100, pct)}%`, background: COR_UNIDADE[u.nome] }}
                          />
                        </span>
                        <span className="w-14 text-right font-bold tabular-nums">{pct}%</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Painel>
      </div>

    </main>
    </PalcoTv>
    </>
  );
}
