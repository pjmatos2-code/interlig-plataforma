import type { Perfil } from "@/lib/tipos";
import { resolverEscopo, type CadastroGrr, type EscopoGrr } from "./escopo";

/**
 * Reuniões do GRR (regras puras). A Reunião Semanal da Equipe Comercial é
 * conduzida pela coordenação com os agentes; a reunião de resultados da
 * diretoria segue no Relatório da diretoria. As duas usam os mesmos
 * indicadores (lib/grr/montar.ts) e a mesma tabela de reuniões.
 */

export type Modalidade = "equipe" | "diretoria";
export type EscopoReuniao = { tipo: "equipe" | "unidade" | "empresa"; ref: string | null; rotulo: string };
export type Participante = { id: string; nome: string; papel: "agente" | "coordenacao" | "convidado" };

export type ReuniaoGrr = {
  id: string;
  modalidade: Modalidade;
  escopo_tipo: EscopoReuniao["tipo"];
  escopo_ref: string | null;
  escopo_rotulo: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  data_reuniao: string;
  periodo_inicio: string;
  periodo_fim: string;
  participantes: Participante[];
  observacoes: string | null;
  boas_praticas: string | null;
  situacao: "aberta" | "encerrada";
  dados: unknown | null;
  corte_em: string | null;
  encerrada_em: string | null;
  encerrada_por: string | null;
  criada_em: string;
  criada_por: string | null;
};

export type SituacaoCompromisso = "pendente" | "em_andamento" | "concluido" | "nao_feito" | "cancelado";
export type Aprovacao = "nao_se_aplica" | "aguardando" | "aprovado" | "ajuste" | "rejeitado";
export type Compromisso = {
  id: string;
  reuniao_id: string;
  tipo: "operacional" | "gerencial";
  agente_id: string | null;
  responsavel_nome: string | null;
  descricao: string;
  prazo: string | null;
  situacao: SituacaoCompromisso;
  aprovacao: Aprovacao;
  conferido_em: string | null;
  criado_em: string;
};

export const ROTULO_SITUACAO: Record<SituacaoCompromisso, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  nao_feito: "Não feito",
  cancelado: "Cancelado",
};
export const ROTULO_APROVACAO: Record<Aprovacao, string> = {
  nao_se_aplica: "—",
  aguardando: "Aguardando a diretoria",
  aprovado: "Aprovado",
  ajuste: "Ajuste pedido",
  rejeitado: "Rejeitado",
};

/** recortes em que a pessoa pode criar e conduzir reunião de equipe (o banco confere de novo) */
export function recortesPermitidos(usuario: { id: string; perfil: Perfil; pop_id: string | null }, cadastro: CadastroGrr): EscopoReuniao[] {
  const nomePop = new Map(cadastro.pops.map((p) => [p.id, p.nome]));
  if (usuario.perfil === "gestor" || usuario.perfil === "direcao") {
    return [
      ...cadastro.equipes.map((e) => ({ tipo: "equipe" as const, ref: e.coordenadorId, rotulo: `Equipe de ${e.nome}` })),
      ...cadastro.pops.map((p) => ({ tipo: "unidade" as const, ref: p.id, rotulo: `Unidade ${p.nome}` })),
    ];
  }
  if (usuario.perfil !== "supervisor") return [];
  const equipe = cadastro.equipes.find((e) => e.coordenadorId === usuario.id);
  if (equipe) return [{ tipo: "equipe", ref: equipe.coordenadorId, rotulo: `Equipe de ${equipe.nome}` }];
  return usuario.pop_id ? [{ tipo: "unidade", ref: usuario.pop_id, rotulo: `Unidade ${nomePop.get(usuario.pop_id) ?? ""}`.trim() }] : [];
}

/** o recorte dos indicadores da reunião: a equipe (pessoas) ou a unidade */
export function escopoDaReuniao(r: Pick<ReuniaoGrr, "escopo_tipo" | "escopo_ref">, cadastro: CadastroGrr): EscopoGrr {
  const filtros = r.escopo_tipo === "equipe" ? { equipe: r.escopo_ref ?? undefined } : r.escopo_tipo === "unidade" ? { unidade: r.escopo_ref ?? undefined } : {};
  return resolverEscopo({ perfil: "direcao", pop_id: null }, null, filtros, cadastro);
}

/** quem é chamado para a reunião: os agentes do recorte e quem coordena */
export function participantesSugeridos(r: Pick<ReuniaoGrr, "escopo_tipo" | "escopo_ref">, cadastro: CadastroGrr): Participante[] {
  const escopo = escopoDaReuniao(r, cadastro);
  const agentes = escopo.agentesDisponiveis.map((v) => ({ id: v.id, nome: v.nome, papel: "agente" as const }));
  const equipe = r.escopo_tipo === "equipe" ? cadastro.equipes.find((e) => e.coordenadorId === r.escopo_ref) : null;
  return equipe ? [{ id: equipe.coordenadorId, nome: equipe.nome, papel: "coordenacao" }, ...agentes] : agentes;
}

/** compromissos que a reunião confere: os da reunião anterior do mesmo recorte que não foram cancelados */
export function compromissosParaConferir(anteriores: Compromisso[]): Compromisso[] {
  return anteriores.filter((c) => c.situacao !== "cancelado" && c.aprovacao !== "rejeitado");
}

export function resumoCompromissos(lista: Compromisso[], hoje: string) {
  const vivos = lista.filter((c) => c.situacao !== "cancelado");
  return {
    total: vivos.length,
    concluidos: vivos.filter((c) => c.situacao === "concluido").length,
    naoFeitos: vivos.filter((c) => c.situacao === "nao_feito").length,
    emAberto: vivos.filter((c) => c.situacao === "pendente" || c.situacao === "em_andamento").length,
    atrasados: vivos.filter((c) => (c.situacao === "pendente" || c.situacao === "em_andamento") && !!c.prazo && c.prazo < hoje).length,
    aguardandoDiretoria: vivos.filter((c) => c.aprovacao === "aguardando").length,
  };
}

/** a reunião pode ser conduzida e encerrada por quem? direção, administração e a coordenação do recorte */
export function podeConduzir(usuario: { id: string; perfil: Perfil; pop_id: string | null }, r: Pick<ReuniaoGrr, "escopo_tipo" | "escopo_ref">, cadastro: CadastroGrr): boolean {
  return recortesPermitidos(usuario, cadastro).some((e) => e.tipo === r.escopo_tipo && e.ref === r.escopo_ref);
}

/** participantes vindos do formulário (ids marcados), na ordem sugerida, sem repetir e sem gente de fora */
export function lerParticipantes(marcados: string[], sugeridos: Participante[], convidados: string): Participante[] {
  const set = new Set(marcados);
  const dentro = sugeridos.filter((p) => set.has(p.id));
  const extras = convidados
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((nome, i) => ({ id: `convidado-${i + 1}`, nome: nome.slice(0, 60), papel: "convidado" as const }));
  return [...dentro, ...extras];
}
