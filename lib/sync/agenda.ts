import { somarDias } from "@/lib/datas";

/**
 * Quando cada rotina de /api/rotinas está "na vez" (24/10/2026). Regras puras
 * — o relógio entra por parâmetro — para os testes garantirem horário e
 * cadência; as mesmas que valiam quando essas etapas moravam no fim do
 * /api/sync (onde quase nunca sobrava tempo para elas).
 */

const MIN = 60_000;
const HORA = 60 * MIN;

/** Hora, minuto e data (aaaa-mm-dd) em Santarém (UTC−3, sem horário de verão). */
export function relogioSantarem(agora: number) {
  const d = new Date(agora - 3 * HORA);
  return { hora: d.getUTCHours(), minuto: d.getUTCMinutes(), dia: d.toISOString().slice(0, 10) };
}

/** Expediente comercial: 07h–20h de Santarém. */
export function noExpediente(agora: number): boolean {
  const { hora } = relogioSantarem(agora);
  return hora >= 7 && hora < 20;
}

/** Tempo desde um carimbo ISO; sem carimbo (ou ilegível) conta como "nunca". */
function desde(agora: number, iso: string | null | undefined): number {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? agora - t : Infinity;
}

/** Robô comercial: só no expediente e no máximo a cada 9 min. */
export function roboComercialNaVez(agora: number, ultimaIso: string | null | undefined): boolean {
  return noExpediente(agora) && desde(agora, ultimaIso) >= 9 * MIN;
}

/** Robô de retenção: ~9 min no expediente, ~28 min fora (economia 18/09). */
export function retencaoNaVez(agora: number, ultimaIso: string | null | undefined): boolean {
  return desde(agora, ultimaIso) >= (noExpediente(agora) ? 9 : 28) * MIN;
}

/** Meu Dia: uma vez por dia, a partir das 00h05 de Santarém. */
export function meuDiaNaVez(agora: number, jaRodouHoje: boolean): boolean {
  const { hora, minuto } = relogioSantarem(agora);
  return !jaRodouHoje && !(hora === 0 && minuto < 5);
}

/** Cancelamentos oficiais: a cada 6 h desde o último sucesso. */
export function cancelamentosNaVez(agora: number, ultimoSucessoIso: string | null | undefined): boolean {
  return desde(agora, ultimoSucessoIso) >= 6 * HORA;
}

/** Ocorrências de atendimento: a cada 3 h desde o último sucesso. */
export function ocorrenciasNaVez(agora: number, ultimoSucessoIso: string | null | undefined): boolean {
  return desde(agora, ultimoSucessoIso) >= 3 * HORA;
}

/**
 * Janela do relatório de ocorrências (pela data de cadastro): os últimos 3
 * dias — ou, se a última leitura boa é mais antiga, desde a véspera dela, com
 * teto de 15 dias. Sem isso, dias em que a etapa não rodou viravam buraco
 * permanente no histórico que alimenta o risco de cancelamento.
 */
export function janelaOcorrencias(
  agora: number,
  ultimoSucessoIso: string | null | undefined
): { de: string; ate: string } {
  const ate = relogioSantarem(agora).dia;
  const padrao = somarDias(ate, -3);
  const teto = somarDias(ate, -15);
  const ultimo = typeof ultimoSucessoIso === "string" ? Date.parse(ultimoSucessoIso) : NaN;
  if (!Number.isFinite(ultimo)) return { de: teto, ate };
  const vespera = somarDias(relogioSantarem(ultimo).dia, -1);
  const de = vespera < padrao ? vespera : padrao;
  return { de: de < teto ? teto : de, ate };
}

/** Fidelidade da base: fora do expediente, quando a faixa mais antiga tem 20 h ou mais. */
export function fidelidadeNaVez(agora: number, maisAntigaIso: string | null | undefined): boolean {
  return !noExpediente(agora) && desde(agora, maisAntigaIso) >= 20 * HORA;
}
