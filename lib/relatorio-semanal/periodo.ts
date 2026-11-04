/**
 * Períodos do Relatório Comercial Semanal (funções puras, fuso de Santarém).
 *
 * A semana é de segunda a domingo. O relatório de uma segunda-feira fala da
 * semana que acabou no domingo anterior. O mês de referência é o da
 * segunda-feira da semana: a semana de 26/10 a 01/11/2026 fala de outubro
 * (fechado em 31/10), como no modelo aprovado pela diretoria.
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export type Semana = { inicio: string; fim: string };
export type MesReferencia = { mes: string; de: string; ate: string; nome: string; fechado: boolean };

/** aaaa-mm-dd de hoje no fuso de Santarém (UTC−3, sem horário de verão) */
export function hojeSantarem(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** soma dias a uma data aaaa-mm-dd */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado */
export function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** segunda-feira da semana de uma data */
export function segundaDaSemana(iso: string): string {
  const dia = diaDaSemana(iso);
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

/** a última semana completa (segunda a domingo) antes de hoje */
export function ultimaSemanaCompleta(hoje: string): Semana {
  const inicio = somarDias(segundaDaSemana(hoje), -7);
  return { inicio, fim: somarDias(inicio, 6) };
}

/** semana que começa numa segunda (valida a data) */
export function semanaDe(inicio: string): Semana {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || diaDaSemana(inicio) !== 1) throw new Error(`a semana começa numa segunda-feira (recebido ${inicio})`);
  return { inicio, fim: somarDias(inicio, 6) };
}

export function semanaAnterior(s: Semana): Semana {
  return { inicio: somarDias(s.inicio, -7), fim: somarDias(s.fim, -7) };
}

/** último dia do mês de uma data */
export function fimDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export function mesDeReferencia(s: Semana): MesReferencia {
  const de = `${s.inicio.slice(0, 7)}-01`;
  const ate = fimDoMes(de);
  return { mes: s.inicio.slice(0, 7), de, ate, nome: MESES[Number(de.slice(5, 7)) - 1], fechado: ate <= s.fim };
}

/** mês anterior ao de referência */
export function mesAnterior(m: MesReferencia, fimDaSemana: string): MesReferencia {
  const [a, mm] = m.de.split("-").map(Number);
  const de = new Date(Date.UTC(a, mm - 2, 1)).toISOString().slice(0, 10);
  const ate = fimDoMes(de);
  return { mes: de.slice(0, 7), de, ate, nome: MESES[Number(de.slice(5, 7)) - 1], fechado: ate <= fimDaSemana };
}

/** "26/10" */
export const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "26/10/2026" */
export const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
/** "26/10 a 01/11/2026" */
export const rotuloSemana = (s: Semana) => `${diaMes(s.inicio)} a ${dataBr(s.fim)}`;
/** "19 a 25/10" no mesmo mês, "26/10 a 01/11" na virada (assunto do e-mail, como no modelo) */
export const rotuloSemanaCurto = (s: Semana) =>
  s.inicio.slice(0, 7) === s.fim.slice(0, 7) ? `${s.inicio.slice(8, 10)} a ${diaMes(s.fim)}` : `${diaMes(s.inicio)} a ${diaMes(s.fim)}`;

/** os 7 dias da semana com rótulo do gráfico: "Seg 26", …, "Dom 01/11" na virada do mês */
export function diasDaSemana(s: Semana): { data: string; rotulo: string; diaSemana: number }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(s.inicio, i);
    const virou = i > 0 && data.slice(5, 7) !== s.inicio.slice(5, 7) && data.slice(8, 10) === "01";
    return { data, rotulo: `${DIAS[diaDaSemana(data)]} ${virou ? diaMes(data) : data.slice(8, 10)}`, diaSemana: diaDaSemana(data) };
  });
}

/** dias entre duas datas aaaa-mm-dd (b − a) */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}
