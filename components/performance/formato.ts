/** Formatação da Performance Comercial (pt-BR, Santarém). */
import type { Indicador, Unidade } from "@/lib/performance/tipos";

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : nf0.format(n));
export const fmtNum1 = (n: number | null | undefined) => (n === null || n === undefined ? "—" : nf1.format(n));
export const fmtBrl = (n: number | null | undefined) => (n === null || n === undefined ? "—" : brl.format(n));
/** cartão de indicador: a partir de R$ 10 mil em forma curta ("R$ 21,2 mil"); o valor cheio vai no título */
const brlCurto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
export const fmtBrlCurto = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.abs(n) >= 10_000 ? brlCurto.format(n) : brl.format(n));
export const fmtPct = (f: number | null | undefined, casas = 0) =>
  f === null || f === undefined ? "—" : `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

/** segundos → "45 s", "3 min 20 s", "2 h 05 min", "1 d 3 h" */
export function fmtDuracao(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return "—";
  const s = Math.round(seg);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 && m < 10 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, "0")} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function fmtValor(valor: number | null | undefined, unidade: Unidade): string {
  if (valor === null || valor === undefined) return "—";
  switch (unidade) {
    case "pct":
      return fmtPct(valor);
    case "seg":
      return fmtDuracao(valor);
    case "brl":
      return fmtBrl(valor);
    case "nota":
      return fmtNum1(valor);
    default:
      return fmtNum(valor);
  }
}

export const fmtIndicador = (i: Indicador) => fmtValor(i.valor, i.unidade);

// data civil (aaaa-mm-dd) não passa por fuso: new Date("2026-10-24") é meia-noite UTC = dia 23 em Santarém
export const fmtData = (iso: string | null | undefined) =>
  !iso ? "—" : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Santarem" });
export const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

/** variação entre períodos: relativa para contagens, em pontos para taxas */
export function variacao(atual: number | null, anterior: number | null, tipo: "relativa" | "pontos" = "relativa", menorEhMelhor = false) {
  if (atual === null || anterior === null) return null;
  if (tipo === "pontos") {
    const pp = (atual - anterior) * 100;
    if (Math.abs(pp) < 0.05) return { texto: "0 p.p.", direcao: "neutro" as const };
    const bom = menorEhMelhor ? pp < 0 : pp > 0;
    return { texto: `${pp > 0 ? "+" : ""}${pp.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`, direcao: bom ? ("sobe" as const) : ("desce" as const), seta: pp > 0 ? "sobe" : "desce" };
  }
  if (anterior === 0) return atual === 0 ? { texto: "igual", direcao: "neutro" as const } : null;
  const r = (atual - anterior) / anterior;
  if (Math.abs(r) < 0.005) return { texto: "igual", direcao: "neutro" as const };
  const bom = menorEhMelhor ? r < 0 : r > 0;
  return { texto: `${r > 0 ? "+" : ""}${Math.round(r * 100)}%`, direcao: bom ? ("sobe" as const) : ("desce" as const), seta: r > 0 ? "sobe" : "desce" };
}

/** faixa de cor de uma nota 0–100 */
export function faixaNota(n: number | null | undefined): "verde" | "amarelo" | "vermelho" | "nd" {
  if (n === null || n === undefined) return "nd";
  return n >= 80 ? "verde" : n >= 60 ? "amarelo" : "vermelho";
}
