/**
 * Operação Técnica (21/11/2026): quadro das ocorrências de campo do SGP, só de
 * leitura. Regras puras — o servidor junta ocorrência, OS e contrato e estas
 * funções decidem tipo, coluna e prioridade.
 *
 * Decisões do gestor (21/11/2026):
 *  - só ocorrências criadas nos últimos 30 dias;
 *  - tipos: Instalação, Mudança de endereço e Suporte (todo o resto de suporte
 *    e infraestrutura junto); recolhimento fica fora (vai para outro módulo),
 *    assim como cobrança, financeiro e cancelamento;
 *  - CNPJ ou plano corporativo sobe para o topo, com selo;
 *  - a plataforma não altera nada no SGP: agendar, executar e fechar seguem lá.
 */

import type { Perfil } from "@/lib/tipos";

/** Quem vê a Operação Técnica: coordenação técnica, gestão e diretoria. */
export const PERFIS_OPERACAO: Perfil[] = ["gestor", "gestor_tecnico", "direcao"];

export const DIAS_QUADRO = 30;
/** Encerradas aparecem só as recentes, para a coluna não engolir o quadro. */
export const DIAS_ENCERRADAS = 7;

export type TipoServico = "instalacao" | "mudanca" | "suporte" | "infraestrutura";
export type Coluna = "aberta" | "agendada" | "execucao" | "validar" | "encerrada";

export const COLUNAS: { chave: Coluna; rotulo: string; ajuda: string }[] = [
  { chave: "aberta", rotulo: "Aberta", ajuda: "Ocorrência aberta, ainda sem agendamento." },
  { chave: "agendada", rotulo: "Agendada", ajuda: "OS com data marcada, técnico ainda não começou." },
  { chave: "execucao", rotulo: "Em execução", ajuda: "Técnico em atendimento (check-in feito)." },
  { chave: "validar", rotulo: "Falta validar", ajuda: "O técnico já fez o serviço (check-in e serviço prestado na OS), mas a OS ou a ocorrência segue aberta no SGP: conferir e dar baixa." },
  { chave: "encerrada", rotulo: "Encerrada", ajuda: `Ocorrências fechadas nos últimos ${DIAS_ENCERRADAS} dias.` },
];

export const ROTULO_TIPO: Record<TipoServico, string> = {
  instalacao: "Instalação",
  mudanca: "Mudança de endereço",
  suporte: "Suporte",
  infraestrutura: "Infraestrutura",
};

/**
 * Infraestrutura da rede (23/11/2026, gestora Juliana Trevisan): sai da
 * Operação Técnica e vai para o módulo próprio. É da Infraestrutura a
 * ocorrência aberta no cliente interno "SETOR INFRAESTRUTURA" (contrato 15139),
 * a direcionada ao setor Infraestrutura no SGP, ou com tipo "Infraestrutura - ...".
 * O nome da responsável não entra: ela também aparece em instalações de clientes.
 */
export const CONTRATO_INFRAESTRUTURA = "15139";
export function ehInfraestrutura(x: { sgpContratoId?: string | null; cliente?: string | null; tipo?: string | null; setorSgp?: string | null }): boolean {
  return (
    String(x.sgpContratoId ?? "") === CONTRATO_INFRAESTRUTURA ||
    /setor\s+infraest/i.test(x.cliente ?? "") ||
    /^infraestrutura/i.test((x.setorSgp ?? "").trim()) ||
    /^infraestrutura/i.test((x.tipo ?? "").trim())
  );
}

/** Tipo da ocorrência do SGP → tipo de serviço de campo (null: fora do quadro). */
export function tipoServico(tipo: string | null | undefined): TipoServico | null {
  const t = (tipo ?? "").trim();
  if (!t) return null;
  if (/mudan[cç]a de endere[cç]o/i.test(t)) return "mudanca";
  if (/^infraestrutura/i.test(t)) return "infraestrutura";
  if (/^operacional\s*-\s*instala[cç][aã]o/i.test(t)) return "instalacao";
  if (/recolh|cancelamento|cobran[cç]a|financeiro|promessa|reten[cç][aã]o|downgrade|upgrade/i.test(t)) return null;
  if (/^(suporte|infraestrutura|operacional)\b/i.test(t) || /chamado fortics/i.test(t)) return "suporte";
  return null;
}

export const encerradaNoSgp = (status: string | null | undefined) => /encerrad/i.test(status ?? "");
export const emExecucaoNoSgp = (status: string | null | undefined) => /execu[cç][aã]o/i.test(status ?? "");
export const pendenteNoSgp = (status: string | null | undefined) => /pendente/i.test(status ?? "");

export type OcorrenciaBase = { status: string | null; encerrada_em?: string | null };
export type OsBase = { status: string | null; agendamento: string | null; checkin?: string | null; servico_prestado?: string | null } | null | undefined;

/**
 * O técnico fez o serviço (21/11/2026): check-in no local e "serviço prestado"
 * registrado na OS, sem estar como pendente. No SGP a OS só fica "Encerrada"
 * quando a pessoa da baixa finaliza (caso real: instalação feita às 09:36, com
 * fotos e assinatura, e a OS seguia "Em execução" à noite). Encerrada no SGP
 * também conta como serviço feito.
 */
export function servicoFeito(os: { status: string | null; checkin?: string | null; servico_prestado?: string | null } | null | undefined): boolean {
  if (!os) return false;
  if (encerradaNoSgp(os.status)) return true;
  return Boolean(os.checkin) && !pendenteNoSgp(os.status) && /[A-Za-z0-9]/.test(os.servico_prestado ?? "");
}

/**
 * Coluna do cartão. A ocorrência manda no fechamento; a OS diz em que pé está
 * o serviço. Serviço feito pelo técnico (OS encerrada, ou com check-in e
 * serviço prestado registrado) com a ocorrência aberta é a pendência de baixa.
 */
export function colunaDa(oc: OcorrenciaBase, os: OsBase): Coluna {
  if (encerradaNoSgp(oc.status)) return "encerrada";
  if (servicoFeito(os)) return "validar";
  if ((os && emExecucaoNoSgp(os.status)) || emExecucaoNoSgp(oc.status)) return "execucao";
  if (os && os.agendamento) return "agendada";
  return "aberta";
}

const PLANO_CORPORATIVO = /CORPORATE|\bPJ\b|DEDICADO|EMPRESARIAL|COMERCIAL/i;

/** Mesma régua da Prevenção: documento com 14 dígitos (CNPJ) ou plano corporativo. */
export function ehCorporativo(doc: string | null | undefined, plano: string | null | undefined, planoMarcado = false): boolean {
  return planoMarcado || (doc ?? "").replace(/\D/g, "").length === 14 || PLANO_CORPORATIVO.test(plano ?? "");
}

export type CartaoOrdenavel = { coluna: Coluna; corporativo: boolean; criadaEm: string; agendamento: string | null; encerradaEm: string | null };

/**
 * Ordem dentro da coluna: corporativo primeiro; depois quem espera há mais
 * tempo. Agendada segue a agenda; encerrada mostra a mais recente no topo.
 */
export function compararCartoes(a: CartaoOrdenavel, b: CartaoOrdenavel): number {
  if (a.coluna === "encerrada" && b.coluna === "encerrada") return (b.encerradaEm ?? "").localeCompare(a.encerradaEm ?? "");
  if (a.corporativo !== b.corporativo) return a.corporativo ? -1 : 1;
  if (a.coluna === "agendada" && b.coluna === "agendada") return (a.agendamento ?? "").localeCompare(b.agendamento ?? "");
  return a.criadaEm.localeCompare(b.criadaEm);
}

/** "3 d 4 h", "5 h", "40 min" — tempo de espera no cartão. */
export function tempoDesde(iso: string | null | undefined, agora: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "—";
  const min = Math.max(0, Math.floor((agora - t) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  const resto = h % 24;
  return resto ? `${d} d ${resto} h` : `${d} d`;
}

/* ---------- período (calendário do quadro, 21/11/2026) ---------- */

export type Periodo = "hoje" | "semana" | "7d" | "mes" | "30d" | "personalizado";
export type BaseData = "abertura" | "agendamento";

export const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "semana", rotulo: "Esta semana" },
  { chave: "7d", rotulo: "Últimos 7 dias" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "30d", rotulo: `Últimos ${DIAS_QUADRO} dias` },
  { chave: "personalizado", rotulo: "Escolher datas" },
];

/** Dia (aaaa-mm-dd) em Santarém (UTC−3, sem horário de verão). */
export function diaSantarem(iso: string | number | null | undefined): string | null {
  const t = typeof iso === "number" ? iso : iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t - 3 * 3_600_000).toISOString().slice(0, 10) : null;
}

const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Intervalo do período (dias inclusos). Semana de segunda a domingo, como no
 * GRR. "Personalizado" usa as datas escolhidas (trocadas se vierem invertidas).
 */
export function intervaloPeriodo(p: Periodo, hoje: string, escolhido?: { de?: string; ate?: string }): { de: string; ate: string } {
  switch (p) {
    case "hoje":
      return { de: hoje, ate: hoje };
    case "semana": {
      const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
      const seg = somar(hoje, dow === 0 ? -6 : 1 - dow);
      return { de: seg, ate: somar(seg, 6) };
    }
    case "7d":
      return { de: somar(hoje, -6), ate: hoje };
    case "mes":
      return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "personalizado": {
      const de = escolhido?.de || somar(hoje, -(DIAS_QUADRO - 1));
      const ate = escolhido?.ate || hoje;
      return de <= ate ? { de, ate } : { de: ate, ate: de };
    }
    default:
      return { de: somar(hoje, -DIAS_QUADRO), ate: hoje };
  }
}

/** O cartão entra no período? Por agendamento, quem não tem data fica de fora. */
export function noPeriodo(c: { criadaEm: string; agendamento: string | null }, base: BaseData, intervalo: { de: string; ate: string }): boolean {
  const dia = diaSantarem(base === "abertura" ? c.criadaEm : c.agendamento);
  return dia !== null && dia >= intervalo.de && dia <= intervalo.ate;
}

/** Fatias de ocorrências que o botão "Atualizar" lê, em ordem (fim exclusivo, em dias a partir de hoje). */
export const FATIAS_ATUALIZAR: [number, number][] = [
  [-9, 1],
  [-19, -9],
  [-31, -19],
];
export function fatiaAtualizar(hoje: string, i: number): { de: string; ateExclusivo: string } | null {
  const f = FATIAS_ATUALIZAR[i];
  return f ? { de: somar(hoje, f[0]), ateExclusivo: somar(hoje, f[1]) } : null;
}
