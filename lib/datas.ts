// Datas no fuso do negócio (America/Santarem, CLAUDE.md). Todas as comparações
// usam strings ISO (aaaa-mm-dd) — sem ambiguidade de fuso no meio do caminho.

import { FUSO } from "@/lib/format";

const fmtIso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data de hoje em Santarém, como aaaa-mm-dd. */
export function hojeIso(): string {
  return fmtIso.format(new Date());
}

/** Soma dias a uma data ISO (aritmética em UTC — dia civil puro). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Primeiro dia do mês N meses atrás (n=0 → mês da data). */
export function mesAtras(iso: string, n: number): string {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  const total = ano * 12 + (mes - 1) - n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

export function ultimoDiaDoMes(iso: string): string {
  const d = new Date(`${primeiroDiaDoMes(iso)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Dias corridos entre duas datas ISO (inclusive nas pontas). */
export function diasEntre(deIso: string, ateIso: string): number {
  const de = new Date(`${deIso}T00:00:00Z`).getTime();
  const ate = new Date(`${ateIso}T00:00:00Z`).getTime();
  return Math.round((ate - de) / 86_400_000) + 1;
}

/** Segunda-feira da semana da data (semana comercial começa na segunda). */
export function inicioDaSemana(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = domingo
  return somarDias(iso, dow === 0 ? -6 : 1 - dow);
}

export type Periodo = {
  tipo: "hoje" | "semana" | "mes" | "personalizado";
  de: string;
  ate: string;
  /** período imediatamente anterior, de mesmo tamanho (comparativo do PRD 3.1) */
  deAnterior: string;
  ateAnterior: string;
};

/** Resolve o filtro global de período (PRD 3.1) a partir da query string. */
export function resolverPeriodo(params: {
  periodo?: string;
  de?: string;
  ate?: string;
}): Periodo {
  const hoje = hojeIso();
  const ehIso = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  let tipo: Periodo["tipo"] = "mes";
  let de = primeiroDiaDoMes(hoje);
  let ate = hoje;

  if (params.periodo === "hoje") {
    tipo = "hoje";
    de = hoje;
  } else if (params.periodo === "semana") {
    tipo = "semana";
    de = inicioDaSemana(hoje);
  } else if (params.periodo === "personalizado" && ehIso(params.de) && ehIso(params.ate)) {
    tipo = "personalizado";
    de = params.de!;
    ate = params.ate! <= hoje ? params.ate! : hoje;
    if (de > ate) [de, ate] = [ate, de];
  }

  const tamanho = diasEntre(de, ate);
  const ateAnterior = somarDias(de, -1);
  const deAnterior = somarDias(ateAnterior, -(tamanho - 1));

  return { tipo, de, ate, deAnterior, ateAnterior };
}
