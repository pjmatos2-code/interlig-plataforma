/**
 * Calendário da Operação Técnica (21/11/2026): por dia, o que está AGENDADO
 * (OS com data marcada, ainda não encerrada — fica no dia do agendamento) e o
 * que foi CONCLUÍDO (OS encerrada pelo técnico — fica no dia do encerramento).
 * Decisão do gestor: só esses dois estados. Funções puras.
 *
 * Entram as OS de campo: instalação, mudança de endereço e suporte. Ficam fora
 * recolhimento (módulo próprio), cobrança e financeiro. O atendimento pelo
 * Fortics só entra quando a ocorrência foi para um gestor técnico.
 */

import type { TipoServico } from "./regras";

const MOTIVOS: Record<string, TipoServico> = {
  "Instalação de equipamento": "instalacao",
  "Mudança Endereço": "mudanca",
  LOS: "suporte",
  Corretiva: "suporte",
  "Sem Acesso": "suporte",
  Preventiva: "suporte",
  "Troca de equipamento": "suporte",
  "Instalação de roteador adicional": "suporte",
  "Mudança de Comodo": "suporte",
  // só quando a ocorrência foi para um gestor técnico (forticsConta, conferido na leitura)
  "Atendimento Fortics": "suporte",
};
export const MOTIVOS_CALENDARIO = Object.keys(MOTIVOS);
/** OS de campo sem o atendimento pelo Fortics (para contar técnico responsável vazio etc.) */
export const MOTIVOS_CAMPO = MOTIVOS_CALENDARIO.filter((m) => m !== "Atendimento Fortics");

/** motivo da OS → tipo de serviço do calendário (null: fora) */
export const tipoDoMotivo = (motivo: string | null | undefined): TipoServico | null => MOTIVOS[(motivo ?? "").trim()] ?? null;

export type EstadoCalendario = "agendado" | "concluido";

export type OsCalendario = {
  osId: string;
  estado: EstadoCalendario;
  /** dia (aaaa-mm-dd, Santarém) em que a OS aparece: agendamento ou encerramento */
  dia: string;
  /** hora do agendamento ou do encerramento (ISO) */
  quando: string;
  vencido: boolean;
  tipo: TipoServico;
  motivo: string;
  cliente: string;
  bairro: string | null;
  unidade: string;
  tecnico: string | null;
  corporativo: boolean;
  sgpContratoId: string | null;
  sgpClienteId: string | null;
  documento: string | null;
};

const HORA = 3_600_000;
export const diaSantarem = (iso: string) => new Date(Date.parse(iso) - 3 * HORA).toISOString().slice(0, 10);

/**
 * Em que dia e estado a OS entra no calendário. Encerrada → concluída no dia
 * do encerramento; aberta com agendamento → agendada no dia marcado (vencida
 * se a hora já passou); aberta sem agendamento → não entra.
 */
export function posicaoNoCalendario(
  os: { status: string | null; agendamento: string | null; encerradaEm: string | null },
  agora: number
): { estado: EstadoCalendario; dia: string; quando: string; vencido: boolean } | null {
  if (/encerrad/i.test(os.status ?? "")) {
    return os.encerradaEm ? { estado: "concluido", dia: diaSantarem(os.encerradaEm), quando: os.encerradaEm, vencido: false } : null;
  }
  if (!os.agendamento) return null;
  const emExecucao = /execu/i.test(os.status ?? "");
  return { estado: "agendado", dia: diaSantarem(os.agendamento), quando: os.agendamento, vencido: !emExecucao && Date.parse(os.agendamento) < agora };
}

const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "2026-11" válido ou o mês de hoje */
export function resolverMes(param: string | undefined, hoje: string): string {
  return param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : hoje.slice(0, 7);
}

export function mesVizinho(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** grade do mês: semanas de segunda a domingo, com os dias de fora do mês para completar */
export function gradeDoMes(mes: string): { de: string; ate: string; semanas: string[][] } {
  const primeiro = `${mes}-01`;
  const ultimo = somar(`${mesVizinho(mes, 1)}-01`, -1);
  const dow = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
  const de = somar(primeiro, -((dow(primeiro) + 6) % 7));
  const ate = somar(ultimo, (7 - dow(ultimo)) % 7);
  const semanas: string[][] = [];
  for (let d = de; d <= ate; d = somar(d, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => somar(d, i)));
  return { de, ate, semanas };
}

export const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const rotuloMes = (mes: string) => `${NOME_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
