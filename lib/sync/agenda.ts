import { mesAtras, somarDias } from "@/lib/datas";

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

/**
 * Ocorrências de atendimento (revisto em 14/11/2026). O relatório do SGP filtra
 * pela data de cadastro e a data FINAL NÃO ENTRA: 12/11 a 12/11 volta vazio, e
 * 12/11 a 13/11 traz só o dia 12. Por isso cada leitura pede até amanhã, senão
 * as ocorrências de hoje só apareciam no dia seguinte.
 *
 * O cursor (integracoes_config "sgp" → ocorrencias_cursor) guarda o primeiro dia
 * que ainda precisa ser lido. Hoje nunca fica "fechado": volta a ser lido na
 * próxima vez. Atrasada, a leitura vai em trechos de 7 dias até alcançar hoje.
 * Antes, o teto de 15 dias deixava buraco quando a etapa ficava parada mais que
 * isso, como de 28/10 a 14/11/2026.
 */
const DIAS_RELIDOS = 3; // relê os últimos dias para pegar status e encerramento das recentes
export const DIAS_POR_TRECHO = 7; // ~1.000 ocorrências, 10–25 s no SGP (medido em 14/11/2026)
const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Primeiro dia de ocorrências ainda por ler. Sem cursor gravado (leituras de
 * antes de 14/11/2026), deduz pela última leitura boa: aquelas pediam até
 * "hoje" e o dia final não entrava. Nunca recua mais de 60 dias.
 */
export function cursorOcorrencias(
  agora: number,
  cursor: string | null | undefined,
  ultimoSucessoIso: string | null | undefined
): string {
  const hoje = relogioSantarem(agora).dia;
  const piso = somarDias(hoje, -60);
  if (typeof cursor === "string" && ISO_DIA.test(cursor)) {
    return cursor > hoje ? hoje : cursor < piso ? piso : cursor;
  }
  const ultimo = typeof ultimoSucessoIso === "string" ? Date.parse(ultimoSucessoIso) : NaN;
  if (!Number.isFinite(ultimo)) return somarDias(hoje, -15);
  const vespera = somarDias(relogioSantarem(ultimo).dia, -1);
  return vespera < piso ? piso : vespera > hoje ? hoje : vespera;
}

export type TrechoOcorrencias = {
  de: string;
  /** data final pedida ao SGP; o dia em si não entra */
  ateExclusivo: string;
  /** cursor depois de uma leitura boa deste trecho */
  cursorDepois: string;
  /** o trecho vai até hoje (não falta nada depois dele) */
  chegaHoje: boolean;
};

/** Próximo trecho a ler: relê sempre os últimos 3 dias; atrasada, até 7 dias a partir do cursor. */
export function trechoOcorrencias(agora: number, cursor: string, maxDias = DIAS_POR_TRECHO): TrechoOcorrencias {
  const hoje = relogioSantarem(agora).dia;
  const amanha = somarDias(hoje, 1);
  const recentes = somarDias(hoje, -DIAS_RELIDOS);
  const de = cursor < recentes ? cursor : recentes;
  const fim = somarDias(de, Math.max(1, maxDias));
  const ateExclusivo = fim < amanha ? fim : amanha;
  return { de, ateExclusivo, cursorDepois: ateExclusivo < hoje ? ateExclusivo : hoje, chegaHoje: ateExclusivo === amanha };
}

/**
 * Atrasada (cursor antes dos últimos 3 dias): um trecho por disparo, até
 * alcançar hoje. Em dia: a cada 1 h no expediente e a cada 3 h fora dele.
 */
export function ocorrenciasNaVez(agora: number, ultimoSucessoIso: string | null | undefined, cursor: string): boolean {
  if (cursor < somarDias(relogioSantarem(agora).dia, -DIAS_RELIDOS)) return true;
  return desde(agora, ultimoSucessoIso) >= (noExpediente(agora) ? 1 : 3) * HORA;
}

/**
 * Cancelamentos lidos pelo botão da Prevenção: desde a véspera da última
 * leitura boa, no mínimo os últimos 3 dias. Nunca antes do 1º dia do mês
 * anterior; a leitura completa continua com a rotina de 6 h. Aqui a data final
 * entra, ao contrário do relatório de ocorrências.
 */
export function janelaCancelamentosRecentes(
  agora: number,
  ultimoSucessoIso: string | null | undefined
): { de: string; ate: string } {
  const hoje = relogioSantarem(agora).dia;
  const piso = mesAtras(hoje, 1);
  const ultimo = typeof ultimoSucessoIso === "string" ? Date.parse(ultimoSucessoIso) : NaN;
  let de = Number.isFinite(ultimo) ? somarDias(relogioSantarem(ultimo).dia, -1) : piso;
  if (de > somarDias(hoje, -3)) de = somarDias(hoje, -3);
  return { de: de < piso ? piso : de, ate: hoje };
}

/** Fidelidade da base: fora do expediente, quando a faixa mais antiga tem 20 h ou mais. */
export function fidelidadeNaVez(agora: number, maisAntigaIso: string | null | undefined): boolean {
  return !noExpediente(agora) && desde(agora, maisAntigaIso) >= 20 * HORA;
}
