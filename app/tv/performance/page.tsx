import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Clock3, Gauge, ListChecks, MessagesSquare, Target, UserCheck } from "lucide-react";
import { LogoInterlig } from "@/components/marca/logo-interlig";
import { cn } from "@/lib/utils";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { calcularLinha, calcularTotais, indexar } from "@/lib/performance/dados/calcular";
import { apurarMetas } from "@/lib/performance/dados/metas";
import { exigirEscopo } from "@/lib/performance/escopo";
import { resolverPeriodoPerf } from "@/lib/performance/periodo";
import { ROTULO_SITUACAO_META } from "@/lib/performance/regras/metas";
import { BotaoTelaCheia, PalcoTv, Relogio } from "../comercial/cliente";
import { AtualizarPerformanceTv } from "./atualizar";

export const dynamic = "force-dynamic";

/**
 * Versão para TV da Performance Comercial (PRD 17, 24/10/2026): só números
 * AGREGADOS do time — sem nome de cliente, sem nota individual, sem posição
 * de ranking — porque fica exposta no salão. Mesmas definições das telas.
 */
const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const pct = (f: number | null | undefined) => (f === null || f === undefined ? "—" : `${Math.round(f * 100)}%`);
function duracao(seg: number | null) {
  if (seg === null) return "—";
  const m = Math.round(seg / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

function Kpi({ icone, rotulo, valor, rodape, cor }: { icone: ReactNode; rotulo: string; valor: string; rodape: ReactNode; cor: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-sky-500/25 bg-[#0d1b3d]/[0.86] px-5 py-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ background: cor }}>
        {icone}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-widest text-slate-300">{rotulo}</p>
        <p className="text-4xl font-black tabular-nums leading-tight text-white">{valor}</p>
        <div className="truncate text-sm text-slate-400">{rodape}</div>
      </div>
    </div>
  );
}

function Painel({ titulo, sub, children, className }: { titulo: string; sub?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex min-h-0 flex-col rounded-2xl border border-sky-500/20 bg-[#0d1b3d]/[0.86] px-5 py-4", className)}>
      <h2 className="text-lg font-bold tracking-wide text-white">{titulo}</h2>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function Barra({ fracao, cor = "#2f8cff" }: { fracao: number | null; cor?: string }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, fracao ?? 0)) * 100}%`, background: cor }} />
    </div>
  );
}

export default async function TvPerformancePage() {
  const escopo = await exigirEscopo();
  if (escopo.papel === "vendedor") redirect("/performance/vendedor/eu");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const ap = await apurarPerformance(escopo, resolverPeriodoPerf({ periodo: "mes" }, hoje), {});
  const metas = await apurarMetas(ap, hoje);
  const base = ap.base;
  const idx = indexar(base);
  // hoje sai da mesma base do mês (sem nova leitura do banco)
  const linhasHoje = ap.linhas.map((l) => calcularLinha(base, idx, l.vendedor, hoje, hoje));
  const tHoje = calcularTotais(base, idx, linhasHoje, hoje, hoje, { incluirSemDono: escopo.vendedorIds === null });
  const t = ap.totais;
  const fu = ap.linhas.reduce(
    (s, l) => {
      const i = l.esforco.indicadores.followups_prazo;
      return { num: s.num + (i?.numerador ?? 0), den: s.den + (i?.denominador ?? 0) };
    },
    { num: 0, den: 0 }
  );
  const serie = t.serie;
  const maxSerie = Math.max(1, ...serie.map((d) => Math.max(d.leads, d.vendas)));
  const COR_UNIDADE: Record<string, string> = { Altamira: "#2f8cff", "Vitória do Xingu": "#22d3a6", "Brasil Novo": "#f59e0b" };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const nomeMes = `${MESES[Number(hoje.slice(5, 7)) - 1]} de ${hoje.slice(0, 4)}`;

  return (
    <>
      <BotaoTelaCheia />
      <PalcoTv>
        <main className="flex h-full flex-col px-8 py-4 text-white">
          <AtualizarPerformanceTv />
          <header className="mb-3 flex shrink-0 items-center justify-between">
            <LogoInterlig variante="clara" tamanho="md" />
            <div className="text-center">
              <h1 className="text-4xl font-black tracking-[0.12em]">PERFORMANCE COMERCIAL</h1>
              <p className="text-sm tracking-[0.35em] text-slate-300">ATENDIMENTO · FOLLOW-UPS · METAS DO TIME</p>
            </div>
            <Relogio />
          </header>

          <div className="grid shrink-0 grid-cols-6 gap-4">
            <Kpi cor="#1d6ff2" icone={<MessagesSquare className="h-7 w-7 text-white" />} rotulo="LEADS HOJE" valor={num(tHoje.leadsRecebidos)} rodape={`${num(t.leadsRecebidos)} no mês`} />
            <Kpi cor="#0f9f6e" icone={<UserCheck className="h-7 w-7 text-white" />} rotulo="LEADS ATENDIDOS" valor={pct(t.leadsRecebidos ? t.leadsAtendidos / t.leadsRecebidos : null)} rodape={`${num(t.leadsAtendidos)} de ${num(t.leadsRecebidos)} no mês`} />
            <Kpi cor="#7c3aed" icone={<Clock3 className="h-7 w-7 text-white" />} rotulo="1ª RESPOSTA (MEDIANA)" valor={duracao(t.primeiraRespostaMediana)} rodape={`no mês · hoje ${duracao(tHoje.primeiraRespostaMediana)}`} />
            <Kpi cor="#0891b2" icone={<Gauge className="h-7 w-7 text-white" />} rotulo="SLA DE RESPOSTA" valor={pct(t.slaPct)} rodape={`até ${base.cfg.sla.primeira_resposta_min} min no expediente`} />
            <Kpi
              cor="#d97706"
              icone={<ListChecks className="h-7 w-7 text-white" />}
              rotulo="FOLLOW-UPS NO PRAZO"
              valor={fu.den >= base.cfg.volume_minimo.followups ? pct(fu.num / fu.den) : "—"}
              rodape={fu.den >= base.cfg.volume_minimo.followups ? `${num(fu.num)} de ${num(fu.den)} · ${num(t.followupsVencidos)} vencido(s)` : `poucos registrados (${num(fu.den)}) · ${num(t.followupsVencidos)} vencido(s)`}
            />
            <Kpi cor="#db2777" icone={<Target className="h-7 w-7 text-white" />} rotulo="CONVERSÃO REAL" valor={pct(t.conversao)} rodape={`${num(t.vendas)} vendas no mês`} />
          </div>

          <div className="mt-4 grid min-h-0 flex-1 grid-cols-[1fr_1.35fr_0.9fr] gap-4">
            <Painel titulo={`METAS DO MÊS — ${nomeMes.toUpperCase()}`} sub="Vendas pela data da venda × meta de quem tem meta no mês. Projeção é estimativa.">
              <div className="flex flex-1 flex-col justify-center gap-5">
                {metas.unidades.length === 0 && <p className="text-slate-400">Sem metas cadastradas no mês.</p>}
                {metas.unidades.map((u) => (
                  <div key={u.nome}>
                    <div className="mb-1.5 flex items-baseline justify-between">
                      <span className="text-xl font-bold">{u.nome}</span>
                      <span className="text-sm text-slate-300">
                        <b className="text-2xl font-black text-white tabular-nums">{num(u.realizado)}</b> de {num(u.meta)} · {pct(u.pct)}
                      </span>
                    </div>
                    <Barra fracao={u.pct} cor={COR_UNIDADE[u.nome] ?? "#2f8cff"} />
                    <p className="mt-1 text-sm text-slate-400">
                      projeção {num(u.projecao)} · {ROTULO_SITUACAO_META[u.situacao].toLowerCase()}
                    </p>
                  </div>
                ))}
              </div>
              {metas.total && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2">
                  <span className="text-sm font-semibold tracking-wide text-sky-200">TIME TODO</span>
                  <span className="text-sm text-slate-300">
                    <b className="text-3xl font-black tabular-nums text-sky-300">{num(metas.total.realizado)}</b> de {num(metas.total.meta)} · faltam {num(metas.mes.diasRestantes)} dia(s) útil(eis)
                  </span>
                </div>
              )}
            </Painel>

            <Painel titulo="LEADS E VENDAS POR DIA" sub="No mês, pela data de entrada do lead e pela data da venda">
              <div className="-mt-1 mb-2 flex gap-5 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-sky-300/35" /> Leads recebidos
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-[#2f8cff]" /> Vendas
                </span>
              </div>
              <div className="flex min-h-0 flex-1 items-end gap-1 border-b border-white/15 pb-0.5">
                {serie.map((d) => (
                  <div key={d.dia} className="flex h-full flex-1 items-end justify-center gap-0.5" title={`${d.dia}: ${d.leads} leads, ${d.vendas} vendas`}>
                    <div className="w-[38%] rounded-t-sm bg-sky-300/35" style={{ height: `${(d.leads / maxSerie) * 100}%` }} />
                    <div className="w-[38%] rounded-t-sm bg-[#2f8cff]" style={{ height: `${(d.vendas / maxSerie) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-1 text-[11px] text-slate-400">
                {serie.map((d) => (
                  <span key={d.dia} className="flex-1 text-center tabular-nums">
                    {Number(d.dia.slice(8))}
                  </span>
                ))}
              </div>
            </Painel>

            <Painel titulo="O TIME AGORA" sub="Média de quem é comparável no mês">
              <div className="flex flex-1 flex-col justify-around gap-3">
                {[
                  ["Esforço comercial", t.esforcoMedio],
                  ["Qualidade das vendas", t.qualidadeMedia],
                  ["IPC do time", t.ipcMedio],
                ].map(([r, v]) => (
                  <div key={r as string}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-lg font-semibold text-slate-200">{r as string}</span>
                      <span className="text-3xl font-black tabular-nums">{v === null ? "—" : Math.round(v as number)}</span>
                    </div>
                    <Barra fracao={v === null ? null : (v as number) / 100} cor="#22d3a6" />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-xs tracking-widest text-slate-400">AGUARDANDO</p>
                    <p className="text-3xl font-black tabular-nums">{num(t.leadsAguardando)}</p>
                    <p className="text-xs text-slate-400">leads sem 1º atendimento</p>
                  </div>
                  <div className="rounded-xl bg-white/5 px-3 py-2">
                    <p className="text-xs tracking-widest text-slate-400">ATIVAÇÕES</p>
                    <p className="text-3xl font-black tabular-nums">{num(t.ativacoes)}</p>
                    <p className="text-xs text-slate-400">no mês</p>
                  </div>
                </div>
              </div>
            </Painel>
          </div>
          <p className="mt-2 shrink-0 text-center text-xs text-slate-500">Indicadores agregados de apoio à gestão · atualiza a cada 5 min · dados do chat, do CRM e do SGP</p>
        </main>
      </PalcoTv>
    </>
  );
}
