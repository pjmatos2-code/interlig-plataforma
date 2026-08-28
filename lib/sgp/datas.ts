import "server-only";

/**
 * O SGP envia datas/horas SEM fuso, no horário local de Santarém (UTC-3).
 * Gravar essa string direto num timestamptz fazia o Postgres assumir UTC — o
 * agendamento das 09:30 virava 09:30Z e aparecia como 06:30 na tela (3h a
 * menos). Este helper carimba o offset correto antes de gravar.
 *
 * Aceita "2026-08-29 09:30:00", "2026-08-29T09:30:00" e o formato BR
 * "29/08/2026 09:30:00". Strings que já trazem fuso (Z ou ±hh:mm) passam
 * intactas.
 */
export function dataHoraSgp(valor: string | null | undefined): string | null {
  const bruto = (valor ?? "").trim();
  if (!bruto) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(bruto)) return bruto; // já tem fuso

  // formato BR: 29/08/2026 09:30:00
  const br = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, a, hh = "00", mm = "00", ss = "00"] = br;
    return `${a}-${m}-${d}T${hh}:${mm}:${ss}-03:00`;
  }

  // formato ISO sem fuso: 2026-08-29 09:30:00 / 2026-08-29T09:30
  const iso = bruto.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (iso) {
    const [, data, hh, mm, ss] = iso;
    if (!hh) return data; // data pura (sem hora) — não sofre fuso
    return `${data}T${hh}:${mm}:${ss ?? "00"}-03:00`;
  }

  return bruto; // formato desconhecido: não inventa conversão
}
