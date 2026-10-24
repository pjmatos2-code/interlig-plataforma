/**
 * Tempo dentro do expediente (24/10/2026). Santarém é UTC−3 fixo (sem
 * horário de verão), então cada turno "HH:MM" vira um instante absoluto com
 * sufixo -03:00. Dias não úteis (domingos e feriados do calendário) vêm de
 * fora pela função ehDiaUtil — o módulo usa a tabela `calendario`.
 * Arquivo puro: testado em expediente.test.ts.
 */
import type { Expediente } from "./config";

const OFFSET = "-03:00";
const DIA_MS = 86_400_000;

/** data civil (aaaa-mm-dd) de um instante, no fuso de Santarém */
export function diaSantarem(ms: number): string {
  return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** dia da semana (0 = domingo) de uma data civil aaaa-mm-dd */
function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/**
 * Segundos de expediente entre dois instantes ISO. Fim antes do início = 0.
 * Janela máxima de 400 dias (proteção contra datas absurdas).
 */
export function segundosUteis(
  inicioIso: string,
  fimIso: string,
  expediente: Expediente,
  ehDiaUtil: (dia: string) => boolean
): number {
  const ini = Date.parse(inicioIso);
  const fim = Date.parse(fimIso);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim <= ini) return 0;
  let total = 0;
  let dia = diaSantarem(ini);
  const ultimo = diaSantarem(fim);
  for (let i = 0; i < 400 && dia <= ultimo; i++) {
    if (ehDiaUtil(dia)) {
      for (const [h1, h2] of expediente[String(diaDaSemana(dia))] ?? []) {
        const a = Math.max(ini, Date.parse(`${dia}T${h1}:00${OFFSET}`));
        const b = Math.min(fim, Date.parse(`${dia}T${h2}:00${OFFSET}`));
        if (b > a) total += b - a;
      }
    }
    dia = new Date(Date.parse(`${dia}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
  }
  return Math.round(total / 1000);
}

/** o instante cai dentro de um turno de expediente? */
export function dentroDoExpediente(iso: string, expediente: Expediente, ehDiaUtil: (dia: string) => boolean): boolean {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const dia = diaSantarem(ms);
  if (!ehDiaUtil(dia)) return false;
  return (expediente[String(diaDaSemana(dia))] ?? []).some(
    ([h1, h2]) => ms >= Date.parse(`${dia}T${h1}:00${OFFSET}`) && ms < Date.parse(`${dia}T${h2}:00${OFFSET}`)
  );
}

/**
 * Soma N segundos de expediente a partir de um instante (para prazos de
 * SLA). Devolve o instante ISO em que o prazo vence.
 */
export function somarSegundosUteis(
  inicioIso: string,
  segundos: number,
  expediente: Expediente,
  ehDiaUtil: (dia: string) => boolean
): string {
  let restante = Math.max(0, segundos) * 1000;
  let cursor = Date.parse(inicioIso);
  let dia = diaSantarem(cursor);
  for (let i = 0; i < 400; i++) {
    if (ehDiaUtil(dia)) {
      for (const [h1, h2] of expediente[String(diaDaSemana(dia))] ?? []) {
        const a = Math.max(cursor, Date.parse(`${dia}T${h1}:00${OFFSET}`));
        const b = Date.parse(`${dia}T${h2}:00${OFFSET}`);
        if (b <= a) continue;
        if (b - a >= restante) return new Date(a + restante).toISOString();
        restante -= b - a;
        cursor = b;
      }
    }
    dia = new Date(Date.parse(`${dia}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10);
    cursor = Math.max(cursor, Date.parse(`${dia}T00:00:00${OFFSET}`));
  }
  return new Date(cursor + restante).toISOString();
}

/** calendário padrão sem tabela: segunda a sábado são úteis */
export const segASab = (dia: string) => diaDaSemana(dia) !== 0;
