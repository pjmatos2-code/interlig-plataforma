import { cn } from "@/lib/utils";
import { rotuloMes, type LinhaPanorama, type Panorama, type PontoAtencao } from "@/lib/grr/panorama";

/**
 * Panorama do mês na reunião de resultados: quanto vamos fechar, com quem se
 * preocupar e o histórico de seis meses por unidade e por agente. Serve à
 * página, ao PDF (A4) e, com `tv`, ao Modo Apresentação.
 */

const n0 = (v: number) => v.toLocaleString("pt-BR");
const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const reais2 = (v: number | null) => (v === null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const varPct = (v: number | null) => (v === null ? "—" : Math.round(v * 100) === 0 ? "igual" : `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`);
const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const corVar = (v: number | null, limite: number) => (v === null ? "text-slate-500" : v <= -limite ? "font-semibold text-red-700" : v >= limite ? "font-semibold text-green-700" : "text-slate-700");

const FAROL = {
  verde: { texto: "Deve bater", selo: "border-farol-verde/40 bg-farol-verde/10 text-green-800", borda: "border-t-farol-verde" },
  amarelo: { texto: "Em risco", selo: "border-farol-amarelo/50 bg-farol-amarelo/15 text-amber-800", borda: "border-t-farol-amarelo" },
  vermelho: { texto: "Não deve bater", selo: "border-farol-vermelho/40 bg-farol-vermelho/10 text-red-800", borda: "border-t-farol-vermelho" },
  sem_meta: { texto: "Sem meta", selo: "border-slate-300 bg-slate-100 text-slate-600", borda: "border-t-slate-300" },
} as const;

function Selo({ l, fechado }: { l: LinhaPanorama; fechado: boolean }) {
  const f = FAROL[l.farol];
  const texto = l.farol === "sem_meta" ? f.texto : l.meta && l.vendas >= l.meta ? "Meta batida" : fechado ? "Não bateu" : f.texto;
  return <span className={cn("inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.8em] font-semibold", f.selo)}>{texto}</span>;
}

/** seis meses fechados e o mês atual: parte cheia = vendido, parte clara = projeção */
function Historico({ l, p, alto = false }: { l: LinhaPanorama; p: Panorama; alto?: boolean }) {
  const proj = Math.round(l.projecao);
  const max = Math.max(1, proj, ...l.serie.map((s) => s.vendas ?? 0), l.meta ?? 0);
  const altura = alto ? 190 : 84;
  const h = (v: number) => Math.max(2, Math.round((v / max) * altura));
  return (
    <div className="mt-3" role="img" aria-label={`Vendas por mês: ${l.serie.map((s) => `${rotuloMes(s.mes)} ${s.vendas ?? "sem registro"}`).join(", ")}; ${rotuloMes(p.mes)} ${l.vendas}${p.fechado ? "" : `, projeção ${proj}`}`}>
      <div className="relative flex items-end gap-1.5" style={{ height: altura + (alto ? 34 : 20) }}>
        {l.mediaVendas !== null && <span className="absolute inset-x-0 border-t border-dashed border-slate-400" style={{ bottom: h(l.mediaVendas) }} />}
        {l.serie.map((s) => (
          <div key={s.mes} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className="text-[0.85em] font-semibold tabular-nums text-slate-700">{s.vendas ?? "—"}</span>
            {s.vendas !== null && <span className="w-full rounded-t bg-slate-400" style={{ height: h(s.vendas) }} />}
          </div>
        ))}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-end">
          <span className="text-[0.85em] font-bold tabular-nums text-interlig-azul">{proj}</span>
          {!p.fechado && proj > l.vendas && <span className="w-full rounded-t border border-dashed border-interlig-azul bg-interlig-ceu/20" style={{ height: Math.max(3, h(proj) - h(l.vendas)) }} />}
          <span className={cn("w-full bg-interlig-azul", (p.fechado || proj <= l.vendas) && "rounded-t")} style={{ height: h(l.vendas) }} />
        </div>
      </div>
      <div className="flex gap-1.5 border-t border-slate-300 pt-0.5 text-center text-[0.8em] text-slate-500">
        {l.serie.map((s) => (
          <span key={s.mes} className="min-w-0 flex-1">{rotuloMes(s.mes)}</span>
        ))}
        <span className="min-w-0 flex-1 font-semibold text-interlig-azul">{rotuloMes(p.mes)}</span>
      </div>
    </div>
  );
}

export function ResumoPanorama({ p, tv = false }: { p: Panorama; tv?: boolean }) {
  const e = p.empresa;
  const proj = Math.round(e.projecao);
  const itens: [string, string, string][] = [
    ["Vendido no mês", e.meta ? `${n0(e.vendas)} de ${n0(e.meta)}` : n0(e.vendas), e.meta ? `${pct(e.vendas / e.meta)} da meta, até ${dia(p.corte)}` : "sem meta cadastrada"],
    [p.fechado ? "Fechamento" : "Devemos fechar em", n0(proj), e.meta ? `${pct(e.atingimento)} da meta` : "projeção pelo ritmo"],
    ["Média de 6 meses", e.mediaVendas === null ? "—" : n0(Math.round(e.mediaVendas)), `${p.fechado ? "fechamento" : "projeção"} ${varPct(e.variacao)}`],
    ["Vendas por dia útil", n1(e.porDia), `últimos 7 dias úteis: ${n1(e.porDia7)} · histórico: ${e.mediaPorDia === null ? "—" : n1(e.mediaPorDia)}`],
    ["Ticket médio", reais2(e.ticket), `mês típico ${reais2(e.mediaTicket)} (${varPct(e.variacaoTicket)})${e.semAgente ? `; só com agente: ${reais2(e.ticketSemAgente)}` : ""}`],
  ];
  return (
    <div className={cn("grid gap-2", tv ? "gap-4 md:grid-cols-3 xl:grid-cols-5" : "grid-cols-2 lg:grid-cols-5 print:grid-cols-5")}>
      {itens.map(([t, v, d], i) => (
        <div key={t} className={cn("min-w-0 rounded-xl border bg-white px-3 py-2", tv && "border-2 border-slate-300 px-5 py-4", i === 1 && "border-t-4", i === 1 && FAROL[e.farol].borda)}>
          <p className={cn("text-slate-600", tv ? "text-[clamp(1rem,1.2vw,1.6rem)]" : "text-xs")}>{t}</p>
          <p className={cn("font-bold tabular-nums tracking-tight", tv ? "text-[clamp(1.6rem,2.4vw,3.4rem)] leading-tight" : "text-lg")}>{v}</p>
          <p className={cn("text-slate-600", tv ? "text-[clamp(0.85rem,1vw,1.35rem)]" : "text-xs")}>{d}</p>
        </div>
      ))}
    </div>
  );
}

const ROTULO_ALVO: Record<PontoAtencao["alvo"], string> = { empresa: "Geral", unidade: "Unidade", agente: "Agente" };

export function PontosPanorama({ pontos, tv = false }: { pontos: PontoAtencao[]; tv?: boolean }) {
  if (!pontos.length) return <p className="text-slate-500">Nenhum ponto de atenção: projeções na meta, volume e ticket dentro do histórico.</p>;
  const grupos = [
    { titulo: "Unidades e geral", itens: pontos.filter((x) => x.alvo !== "agente") },
    { titulo: "Agentes", itens: pontos.filter((x) => x.alvo === "agente") },
  ].filter((g) => g.itens.length);
  return (
    <div className={cn("grid items-start gap-3 md:grid-cols-2 print:grid-cols-2", tv && "gap-5 text-[clamp(0.85rem,1vw,1.4rem)]")}>
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 text-[0.85em] font-semibold text-slate-500">{g.titulo}</p>
          <ListaPontos pontos={g.itens} tv={tv} />
        </div>
      ))}
    </div>
  );
}

function ListaPontos({ pontos, tv }: { pontos: PontoAtencao[]; tv: boolean }) {
  return (
    <ul className={cn("grid gap-2", !tv && "print:text-[12px]")}>
      {pontos.map((x) => (
        <li key={`${x.alvo}-${x.nome}`} className={cn("break-inside-avoid rounded-xl border px-3 py-2", tv && "px-4 py-2", x.nivel === "critico" ? "border-farol-vermelho/40 bg-farol-vermelho/[0.07]" : "border-farol-amarelo/50 bg-farol-amarelo/[0.1]")}>
          <p className="font-semibold">
            <span className={cn("mr-2 text-[0.8em] font-bold uppercase", x.nivel === "critico" ? "text-red-700" : "text-amber-800")}>{x.nivel === "critico" ? "Crítico" : "Atenção"}</span>
            {x.nome} <span className="text-[0.8em] font-normal text-slate-500">{ROTULO_ALVO[x.alvo]}</span>
          </p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[0.93em] text-slate-700">
            {x.motivos.map((m) => (
              <li key={m}>{m.charAt(0).toUpperCase() + m.slice(1)}.</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function UnidadesPanorama({ p, tv = false }: { p: Panorama; tv?: boolean }) {
  return (
    <div className={cn("grid gap-3 md:grid-cols-3 print:grid-cols-3", tv && "flex-1 gap-5 text-[clamp(0.95rem,1.1vw,1.5rem)]")}>
      {p.unidades.map((u) => (
        <div key={u.id} className={cn("break-inside-avoid rounded-xl border border-t-4 bg-white px-3 py-2.5", tv && "border-2 border-t-[6px] border-slate-300 px-5 py-4", FAROL[u.farol].borda)}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">{u.nome}</p>
            <Selo l={u} fechado={p.fechado} />
          </div>
          <p className="mt-1 tabular-nums">
            <b className="text-[1.5em]">{n0(u.vendas)}</b>
            <span className="text-slate-600"> {u.meta ? `de ${n0(u.meta)}` : "sem meta"}</span>
            {!p.fechado && (
              <span className="block text-slate-700">
                Deve fechar em <b>{Math.round(u.projecao)}</b>
                {u.atingimento !== null && ` (${pct(u.atingimento)} da meta)`}
              </span>
            )}
          </p>
          <Historico l={u} p={p} alto={tv} />
          <dl className="mt-2 space-y-0.5 text-[0.93em]">
            {(
              [
                ["Média de 6 meses", `${u.mediaVendas === null ? "—" : n1(u.mediaVendas)} por mês`, null],
                [p.fechado ? "Fechamento x média" : "Projeção x média", varPct(u.variacao), corVar(u.variacao, 0.1)],
                ["Por dia: mês / 7 dias / 6 meses", `${n1(u.porDia)} / ${n1(u.porDia7)} / ${u.mediaPorDia === null ? "—" : n1(u.mediaPorDia)}`, null],
                ["Ticket médio", `${reais2(u.ticket)} (${varPct(u.variacaoTicket)})`, corVar(u.variacaoTicket, 0.05)],
                ...(!p.fechado && u.falta ? [["Falta para a meta", `${u.falta} · ${n1(u.precisaPorDia!)} por dia útil`, "font-semibold"]] : []),
                ...(u.semAgente ? [["Sem agente no mês", `${u.semAgente}${p.fechado ? "" : ` · sem elas: ${Math.round(u.projecaoSemAgente)} vendas, ticket ${reais2(u.ticketSemAgente)}`}`, "font-semibold text-amber-800"]] : []),
              ] as [string, string, string | null][]
            ).map(([t, v, c]) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="text-slate-600">{t}</dt>
                <dd className={cn("text-right tabular-nums", c)}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function AgentesPanorama({ p, tv = false }: { p: Panorama; tv?: boolean }) {
  const cab = ["Agente", ...p.mesesHistorico.map(rotuloMes), "Média", rotuloMes(p.mes), "Meta", ...(p.fechado ? [] : ["Deve fechar"]), "% meta", "x média", ...(p.fechado ? [] : ["Precisa/dia"]), "Faz/dia", "Ticket", "x típico", "Situação"];
  const td = cn("px-1.5 py-1.5 print:py-0.5 text-right tabular-nums", tv && "px-2 py-2.5");
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full", tv ? "text-[clamp(0.85rem,1vw,1.4rem)]" : "min-w-[60rem] text-sm print:min-w-0 print:text-[11px]")}>
        <thead>
          <tr className="border-b text-[0.85em] text-slate-600">
            {cab.map((c, i) => (
              <th key={`${c}-${i}`} className={cn("px-1.5 py-1.5 font-medium", i ? "text-right" : "text-left")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.agentes.map((l) => (
            <tr key={l.id} className={cn("border-b last:border-0", l.farol === "vermelho" && "bg-farol-vermelho/[0.06]", l.farol === "amarelo" && "bg-farol-amarelo/[0.08]")}>
              <td className="whitespace-nowrap px-1.5 py-1.5 font-medium print:py-0.5">
                {l.nome}
                <span className="block text-[0.8em] font-normal text-slate-500">{l.unidade ?? "sem unidade"}</span>
              </td>
              {l.serie.map((s) => (
                <td key={s.mes} className={cn(td, "text-slate-600")}>{s.vendas ?? "—"}</td>
              ))}
              <td className={cn(td, "font-medium")}>{l.mediaVendas === null ? "—" : n1(l.mediaVendas)}</td>
              <td className={cn(td, "font-bold")}>{l.vendas}</td>
              <td className={td}>{l.meta ?? "—"}</td>
              {!p.fechado && <td className={cn(td, "font-bold text-interlig-azul")}>{Math.round(l.projecao)}</td>}
              <td className={td}>{pct(l.atingimento)}</td>
              <td className={cn(td, corVar(l.variacao, 0.1))}>{varPct(l.variacao)}</td>
              {!p.fechado && <td className={td}>{l.precisaPorDia === null ? "—" : n1(l.precisaPorDia)}</td>}
              <td className={td}>{n1(l.porDia7)}</td>
              <td className={cn(td, "whitespace-nowrap")}>{reais2(l.ticket)}</td>
              <td className={cn(td, corVar(l.variacaoTicket, 0.05))}>{varPct(l.variacaoTicket)}</td>
              <td className={td}><Selo l={l} fechado={p.fechado} /></td>
            </tr>
          ))}
          <tr className="text-slate-600">
            <td className="px-1.5 py-1.5">Outros*</td>
            {p.outros.serie.map((v, i) => (
              <td key={p.mesesHistorico[i]} className={td}>{v}</td>
            ))}
            <td className={td} />
            <td className={cn(td, "font-medium")}>{p.outros.vendas}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TicketPanorama({ p }: { p: Panorama }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm print:min-w-0 print:text-[11px]">
        <thead>
          <tr className="border-b text-[0.85em] text-slate-600">
            {["Ticket médio", ...p.mesesHistorico.map(rotuloMes), "Típico", rotuloMes(p.mes), "Variação"].map((c, i) => (
              <th key={`${c}-${i}`} className={cn("px-1.5 py-1.5 font-medium", i ? "text-right" : "text-left")}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {[...(p.unidades.length > 1 ? [p.empresa] : []), ...p.unidades, ...p.agentes].map((l, i) => (
            <tr key={l.id} className={cn("border-b last:border-0", i < p.unidades.length + (p.unidades.length > 1 ? 1 : 0) && "font-medium")}>
              <td className="px-1.5 py-1 print:py-0.5">{l.nome}</td>
              {l.serie.map((s) => (
                <td key={s.mes} className="px-1.5 text-right font-normal text-slate-600">{s.ticket === null ? "—" : n1(s.ticket)}</td>
              ))}
              <td className="px-1.5 text-right">{l.mediaTicket === null ? "—" : n1(l.mediaTicket)}</td>
              <td className="px-1.5 text-right font-bold">{l.ticket === null ? "—" : n1(l.ticket)}</td>
              <td className={cn("px-1.5 text-right", corVar(l.variacaoTicket, 0.05))}>{varPct(l.variacaoTicket)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bloco({ titulo, children, inteiro = true }: { titulo: string; children: React.ReactNode; inteiro?: boolean }) {
  return (
    <div className={cn(inteiro && "break-inside-avoid")}>
      <h3 className="mb-1.5 text-sm font-semibold text-interlig-marinho">{titulo}</h3>
      {children}
    </div>
  );
}

export function PanoramaDoMes({ p }: { p: Panorama }) {
  return (
    <section className="rounded-2xl border bg-card p-4 text-sm shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none" aria-label="Panorama do mês">
      <h2 className="text-base font-semibold tracking-tight">Panorama do mês: {p.fechado ? "fechamento" : "projeção de fechamento"}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Vendas até {dia(p.corte)}/{p.corte.slice(0, 4)} · {p.diasUteis.decorridos} de {p.diasUteis.total} dias úteis{p.fechado ? "" : ` · ${p.diasUteis.restantes} pela frente, contando hoje`}
      </p>
      <div className="space-y-5 print:space-y-3">
        <ResumoPanorama p={p} />
        <Bloco titulo="Com quem se preocupar" inteiro={false}><PontosPanorama pontos={p.pontos} /></Bloco>
        <Bloco titulo="Por unidade"><UnidadesPanorama p={p} /></Bloco>
        <Bloco titulo="Por agente"><AgentesPanorama p={p} /></Bloco>
        <Bloco titulo="Ticket médio, mês a mês (R$)"><TicketPanorama p={p} /></Bloco>
        <p className="text-xs text-muted-foreground">
          Projeção do Dashboard: vendido no mês + dias úteis restantes × ritmo (70% dos últimos 7 dias úteis, 30% da média do mês). Histórico: 6 meses fechados; a média do agente começa no primeiro mês com venda registrada. Unidade conta pelo contrato; agente conta as vendas em qualquer cidade. Prefeitura e rede neutra ficam fora. “Precisa/dia” é quanto falta vender por dia útil para bater a meta; “Faz/dia” é o ritmo dos últimos 7 dias úteis. Ticket típico: mediana dos 6 meses. *Outros: vendas sem agente, da coordenação e de quem não está mais na equipe.
        </p>
      </div>
    </section>
  );
}
