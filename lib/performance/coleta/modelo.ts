/**
 * Modelo interno estável das conversas de atendimento (24/10/2026).
 * Os adaptadores (hoje só o SZ Chat) traduzem o formato do provedor para
 * cá; o resto do módulo só conhece estes tipos — trocar de chatbot é
 * escrever outro adaptador.
 */

/** quem escreveu: o esforço do vendedor só conta mensagens "agente" */
export type AutorMensagem = "cliente" | "agente" | "automacao" | "sistema";

export type EventoInterno =
  | "fluxo_inicio" // automação (bot/URA) começou
  | "espera_inicio" // entrou na fila do atendimento humano
  | "humano_inicio" // um agente assumiu
  | "humano_fim" // agente encerrou
  | "fim_por_tempo" // encerrado por inatividade
  | "transferencia" // passou para outra equipe/agente
  | "transferencia_pedido" // pedido/resposta de transferência (não conta duas vezes)
  | "outro";

export type EventoCiclo = { evento: EventoInterno; bruto: string; em: string };

export type MensagemNormalizada = {
  externoId: string;
  autor: AutorMensagem;
  agenteNome: string | null;
  em: string; // ISO com fuso
  tipo: string | null;
  /** categoria de sessão do canal (ex.: iniciada pelo cliente × pela empresa) */
  categoria: string | null;
  texto: string; // bruto, ainda sem máscara
};

export type ConversaNormalizada = {
  provedor: "szchat";
  externoId: string;
  protocolo: string | null;
  equipe: string | null;
  canal: string | null;
  agenteNome: string | null;
  agenteExternoId: string | null;
  contatoNome: string | null;
  telefone: string | null;
  statusFinal: string | null;
  finalizadaEm: string | null;
  eventos: EventoCiclo[];
  mensagens: MensagemNormalizada[];
};
