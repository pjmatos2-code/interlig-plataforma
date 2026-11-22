/**
 * Clientes deixados para trás (21/11/2026): a lista nominal por trás do
 * indicador do GRR Técnico. OS de instalação (a primeira de cada contrato)
 * criadas nas 8 semanas antes da semana atual e que ainda não viraram contrato
 * ativo nem foram canceladas. Decisão da gestão: meta zero, ninguém pode se
 * perder. Funções puras; a leitura está em deixados-dados.ts.
 */

export const SEMANAS_DEIXADOS = 8;

export type SituacaoDeixado = "falta_assinatura" | "atendido_falta_ativar" | "os_encerrada" | "pendente" | "agendado" | "agendamento_vencido" | "sem_agendamento";

export const ROTULO_SITUACAO_DEIXADO: Record<SituacaoDeixado, string> = {
  falta_assinatura: "Falta a assinatura do cliente",
  atendido_falta_ativar: "Técnico atendeu, falta ativar o contrato",
  os_encerrada: "OS encerrada, contrato não ativou",
  pendente: "OS pendente (técnico não concluiu)",
  agendado: "Agendado",
  agendamento_vencido: "Agendamento vencido",
  sem_agendamento: "Sem agendamento",
};

/** o que trava o cliente, na ordem em que a pendência aparece */
export function situacaoDeixado(
  x: { assinado: boolean; osStatus: string | null; checkin: string | null; servicoPrestado: string | null; agendamento: string | null },
  agora: number
): SituacaoDeixado {
  if (!x.assinado) return "falta_assinatura";
  if (/encerrad/i.test(x.osStatus ?? "")) return "os_encerrada";
  if (/pendente/i.test(x.osStatus ?? "")) return "pendente";
  if (x.checkin && /[A-Za-z0-9]/.test(x.servicoPrestado ?? "")) return "atendido_falta_ativar";
  if (x.agendamento) return Date.parse(x.agendamento) >= agora ? "agendado" : "agendamento_vencido";
  return "sem_agendamento";
}

const somar = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** janela da lista: as 8 semanas antes da semana de hoje (de segunda a domingo) */
export function janelaDeixados(hoje: string): { de: string; ate: string } {
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const segunda = somar(hoje, dow === 0 ? -6 : 1 - dow);
  return { de: somar(segunda, -7 * SEMANAS_DEIXADOS), ate: somar(segunda, -1) };
}

export const diasDesde = (dia: string, hoje: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000);
