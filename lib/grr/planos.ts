import type { Perfil } from "@/lib/tipos";
import type { CartaoGrr } from "./montar";

/**
 * Diagnósticos e planos de ação do GRR (regras puras, Etapa 3).
 * Aprovação (diretoria) e situação (execução) são estados separados;
 * "atrasada" é calculada: prazo vencido sem conclusão nem cancelamento.
 */

export type EscopoTipo = "empresa" | "unidade" | "equipe" | "agente";
export type SituacaoPlano = "pendente" | "em_andamento" | "aguardando_validacao" | "concluida" | "cancelada";
export type AprovacaoPlano = "aguardando" | "aprovado" | "ajuste" | "rejeitado";

export type Diagnostico = {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  indicador: string;
  escopo_tipo: EscopoTipo;
  escopo_ref: string | null;
  escopo_rotulo: string;
  versao: number;
  causa: string;
  evidencias: string | null;
  providencias: string | null;
  solucao: string | null;
  situacao_indicador: CartaoGrr["status"] | null;
  valor: string | null;
  meta: string | null;
  criado_em: string;
  criado_por: string | null;
};

export type Plano = {
  id: string;
  indicador: string | null;
  problema: string | null;
  periodo_inicio: string;
  escopo_tipo: EscopoTipo;
  escopo_ref: string | null;
  escopo_rotulo: string;
  diagnostico_id: string | null;
  reuniao_id: string | null;
  descricao: string;
  resultado_esperado: string | null;
  responsavel_id: string | null;
  responsavel_nome: string;
  prazo: string | null;
  situacao: SituacaoPlano;
  aprovacao: AprovacaoPlano;
  aprovacao_justificativa: string | null;
  aprovacao_por: string | null;
  aprovacao_em: string | null;
  criado_em: string;
  criado_por: string | null;
  atualizado_em: string;
};

export type EventoPlano = { id: string; tipo: "criada" | "situacao" | "aprovacao" | "edicao" | "evidencia" | "comentario"; texto: string | null; dados: Record<string, unknown> | null; criado_em: string; criado_por: string | null };

export const ROTULO_SITUACAO_PLANO: Record<SituacaoPlano | "atrasada", string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
};
export const ROTULO_APROVACAO_PLANO: Record<AprovacaoPlano, string> = {
  aguardando: "Aguardando a diretoria",
  aprovado: "Aprovado",
  ajuste: "Ajuste pedido",
  rejeitado: "Rejeitado",
};

const ABERTAS: SituacaoPlano[] = ["pendente", "em_andamento"];

export function atrasada(p: Pick<Plano, "prazo" | "situacao">, hoje: string): boolean {
  return ABERTAS.includes(p.situacao) && !!p.prazo && p.prazo < hoje;
}

/** a situação que a tela mostra (atrasada por cima de pendente e em andamento) */
export function situacaoExibida(p: Pick<Plano, "prazo" | "situacao">, hoje: string): SituacaoPlano | "atrasada" {
  return atrasada(p, hoje) ? "atrasada" : p.situacao;
}

export type ContagemPlanos = Record<SituacaoPlano | "atrasada", number> & { aguardandoAprovacao: number; total: number };

/** quantos planos em cada situação; rejeitados ficam fora da execução */
export function contarPlanos(planos: Plano[], hoje: string): ContagemPlanos {
  const c: ContagemPlanos = { pendente: 0, em_andamento: 0, aguardando_validacao: 0, concluida: 0, cancelada: 0, atrasada: 0, aguardandoAprovacao: 0, total: 0 };
  for (const p of planos) {
    if (p.aprovacao === "aguardando") c.aguardandoAprovacao++;
    if (p.aprovacao === "rejeitado") continue;
    c.total++;
    c[situacaoExibida(p, hoje)]++;
  }
  return c;
}

const DIRETORIA: Perfil[] = ["gestor", "direcao"];
export const ehDiretoria = (perfil: Perfil) => DIRETORIA.includes(perfil);

/**
 * Quem leva o plano a qual situação: o recorte (coordenação) toca a execução
 * até "aguardando validação"; validar (concluir) é da diretoria. Cancelar
 * também é da diretoria depois de aprovado.
 */
export function situacoesPermitidas(perfil: Perfil, p: Pick<Plano, "situacao" | "aprovacao">): SituacaoPlano[] {
  if (p.situacao === "concluida" || p.situacao === "cancelada") return ehDiretoria(perfil) ? ["em_andamento"] : [];
  const base: SituacaoPlano[] = ["pendente", "em_andamento", "aguardando_validacao"];
  if (ehDiretoria(perfil)) return [...base, "concluida", "cancelada"];
  return p.aprovacao === "aprovado" ? base : [...base, "cancelada"];
}

/** o diagnóstico que vale: a versão mais recente de cada indicador e recorte */
export function diagnosticosAtuais(lista: Diagnostico[]): Diagnostico[] {
  const vale = new Map<string, Diagnostico>();
  for (const d of lista) {
    const k = `${d.periodo_inicio}|${d.indicador}|${d.escopo_tipo}|${d.escopo_ref ?? ""}`;
    const atual = vale.get(k);
    if (!atual || d.versao > atual.versao) vale.set(k, d);
  }
  return [...vale.values()];
}

/** indicadores em atenção ou crítico que ainda não têm diagnóstico no recorte */
export function desviosSemDiagnostico(cartoes: Pick<CartaoGrr, "chave" | "status">[], atuais: Pick<Diagnostico, "indicador">[]): string[] {
  const feitos = new Set(atuais.map((d) => d.indicador));
  return cartoes.filter((c) => (c.status === "atencao" || c.status === "critico") && !feitos.has(c.chave)).map((c) => c.chave);
}

export function proximaVersaoDiagnostico(versoes: number[]): number {
  return versoes.length ? Math.max(...versoes) + 1 : 1;
}

/** prazo que merece aviso hoje: vence amanhã ou já venceu (uma vez por dia) */
export function precisaAvisoDePrazo(p: Pick<Plano, "prazo" | "situacao"> & { aviso_prazo_em: string | null }, hoje: string, amanha: string): boolean {
  if (!ABERTAS.includes(p.situacao) || !p.prazo) return false;
  if (p.aviso_prazo_em && p.aviso_prazo_em >= hoje) return false;
  return p.prazo <= amanha;
}
