/**
 * Métricas por conversa (24/10/2026) — calculadas UMA vez na coleta e
 * gravadas em conversas_atendimento, para as telas não reprocessarem
 * mensagens a cada carregamento. Regras (documentadas na tela de cada
 * indicador e em docs/performance-comercial/indicadores.md):
 *
 *  - Só mensagem de autor "agente" (humano) conta como resposta. Automação
 *    (bot/URA, "Atendimento iniciado por…", aviso de fora do horário) e
 *    mensagens de sistema nunca contam como esforço.
 *  - 1ª resposta: do início da espera humana (evento de fila; sem ele, a 1ª
 *    mensagem do cliente) até a 1ª mensagem humana. Conversa iniciada pelo
 *    agente (contato ativo) não tem 1ª resposta — não há cliente esperando.
 *  - Tempo entre interações: a cada bloco de mensagens do cliente após uma
 *    resposta humana, do 1º recado do bloco até a próxima mensagem humana;
 *    creditado a quem respondeu. A 1ª resposta fica fora (é o SLA).
 *  - Cliente sem resposta: a conversa termina com o cliente esperando, com
 *    mais que uma cortesia (>15 caracteres somados: "ok", "obrigado" não
 *    contam), e só se ela chegou ao atendimento humano.
 *  - Bruto e "útil" (dentro do expediente configurado) lado a lado.
 * Arquivo puro: testado em calculo.test.ts.
 */
import type { Expediente } from "../config";
import { diaSantarem, segundosUteis } from "../expediente";
import type { ConversaNormalizada } from "./modelo";

/** [instante da resposta (epoch s), tempo bruto (s), tempo útil (s)] */
export type Gap = [number, number, number];

export type MetricasAgente = {
  vendedor_id: string | null;
  agente_nome: string;
  msgs: number;
  /** mensagens humanas por dia (Santarém) — filtro exato por período */
  msgs_por_dia: Record<string, number>;
  respostas: number;
  gaps: Gap[];
  primeira_msg_em: string;
  ultima_msg_em: string;
};

export type CalculoConversa = {
  iniciada_em: string | null;
  iniciada_por: "cliente" | "agente" | "automacao" | null;
  espera_inicio_em: string | null;
  humano_inicio_em: string | null;
  finalizada_em: string | null;
  encerrada_por_tempo: boolean;
  primeira_msg_cliente_em: string | null;
  primeira_resposta_em: string | null;
  primeira_resposta_agente: string | null;
  primeira_resposta_vendedor_id: string | null;
  primeira_resposta_seg: number | null;
  primeira_resposta_util_seg: number | null;
  cliente_sem_resposta: boolean;
  transferencias: number;
  msgs_cliente: number;
  msgs_agente: number;
  msgs_automacao: number;
  msgs_sistema: number;
  /** mensagens do cliente por dia (Santarém) */
  cliente_por_dia: Record<string, number>;
  por_agente: Record<string, MetricasAgente>;
  vendedor_principal_id: string | null;
  agente_principal: string | null;
};

const LIMITE_AMOSTRAS = 300;
const CORTESIA_MAX = 15;

const chaveAgente = (vendedorId: string | null, nome: string) =>
  vendedorId ?? `nome:${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()}`;

export function calcularConversa(
  conversa: ConversaNormalizada,
  resolverVendedor: (agenteNome: string) => string | null,
  expediente: Expediente,
  ehDiaUtil: (dia: string) => boolean
): CalculoConversa {
  const msgs = conversa.mensagens; // já ordenadas e sem duplicatas pelo adaptador
  const eventos = conversa.eventos;
  const t = (iso: string) => Date.parse(iso);
  const util = (a: string, b: string) => segundosUteis(a, b, expediente, ehDiaUtil);

  const primeiroEvento = (tipo: string) => eventos.find((e) => e.evento === tipo)?.em ?? null;
  const ultimoEvento = (tipos: string[]) => [...eventos].reverse().find((e) => tipos.includes(e.evento))?.em ?? null;

  const instantes = [...eventos.map((e) => e.em), ...msgs.map((m) => m.em)].sort((a, b) => t(a) - t(b));
  const primeiraFala = msgs.find((m) => m.autor === "cliente" || m.autor === "agente" || m.autor === "automacao");
  const primeiraCliente = msgs.find((m) => m.autor === "cliente")?.em ?? null;
  const primeiraAgente = msgs.find((m) => m.autor === "agente");
  const espera = primeiroEvento("espera_inicio");

  let iniciadaPor: CalculoConversa["iniciada_por"] = null;
  if (primeiraFala) {
    // conversa ativa: o agente falou antes de qualquer mensagem do cliente
    if (primeiraAgente && (!primeiraCliente || t(primeiraAgente.em) < t(primeiraCliente))) iniciadaPor = "agente";
    else iniciadaPor = primeiraFala.autor === "agente" ? "agente" : primeiraFala.autor === "cliente" ? "cliente" : "automacao";
  }

  // ---- 1ª resposta humana
  let primeiraRespostaEm: string | null = null;
  let primeiraRespostaAgente: string | null = null;
  let inicioSla: string | null = null;
  if (iniciadaPor !== "agente" && primeiraCliente) {
    inicioSla = espera && t(espera) >= t(primeiraCliente) ? espera : primeiraCliente;
    let resp = msgs.find((m) => m.autor === "agente" && t(m.em) >= t(inicioSla!));
    if (!resp) {
      // agente assumiu ainda durante a automação, antes do evento de fila
      resp = msgs.find((m) => m.autor === "agente" && t(m.em) >= t(primeiraCliente));
      if (resp) inicioSla = primeiraCliente;
    }
    if (resp) {
      primeiraRespostaEm = resp.em;
      primeiraRespostaAgente = resp.agenteNome ?? "Agente";
    }
  }

  // ---- interações seguintes, por agente
  const porAgente: Record<string, MetricasAgente> = {};
  const registro = (nome: string, em: string) => {
    const vid = resolverVendedor(nome);
    const k = chaveAgente(vid, nome);
    porAgente[k] ??= { vendedor_id: vid, agente_nome: nome, msgs: 0, msgs_por_dia: {}, respostas: 0, gaps: [], primeira_msg_em: em, ultima_msg_em: em };
    return porAgente[k];
  };
  let aguardandoDesde: string | null = null;
  let tamanhoAguardando = 0;
  let jaRespondeu = false; // a 1ª resposta é o SLA, fica fora dos gaps
  const contagem = { cliente: 0, agente: 0, automacao: 0, sistema: 0 };
  const clientePorDia: Record<string, number> = {};
  for (const m of msgs) {
    contagem[m.autor]++;
    if (m.autor === "cliente") {
      const d = diaSantarem(t(m.em));
      clientePorDia[d] = (clientePorDia[d] ?? 0) + 1;
      if (!aguardandoDesde) {
        aguardandoDesde = m.em;
        tamanhoAguardando = 0;
      }
      tamanhoAguardando += m.texto.length || 1;
    } else if (m.autor === "agente") {
      const nome = m.agenteNome ?? "Agente";
      const ag = registro(nome, m.em);
      ag.msgs++;
      const d = diaSantarem(t(m.em));
      ag.msgs_por_dia[d] = (ag.msgs_por_dia[d] ?? 0) + 1;
      ag.ultima_msg_em = m.em;
      if (aguardandoDesde && jaRespondeu && ag.gaps.length < LIMITE_AMOSTRAS) {
        ag.respostas++;
        ag.gaps.push([
          Math.round(t(m.em) / 1000),
          Math.max(0, Math.round((t(m.em) - t(aguardandoDesde)) / 1000)),
          util(aguardandoDesde, m.em),
        ]);
      }
      aguardandoDesde = null;
      tamanhoAguardando = 0;
      jaRespondeu = true;
    }
  }

  const chegouAoHumano = Boolean(espera) || contagem.agente > 0;
  const clienteSemResposta = Boolean(aguardandoDesde) && tamanhoAguardando > CORTESIA_MAX && chegouAoHumano;

  // agente principal: mais mensagens; empate → quem falou por último
  const agentes = Object.values(porAgente).sort(
    (a, b) => b.msgs - a.msgs || t(b.ultima_msg_em) - t(a.ultima_msg_em)
  );
  const principal = agentes[0] ?? null;

  const primeiraRespostaVendedor = primeiraRespostaAgente ? resolverVendedor(primeiraRespostaAgente) : null;
  const finalizada = conversa.finalizadaEm ?? ultimoEvento(["humano_fim", "fim_por_tempo"]);

  return {
    iniciada_em: instantes[0] ?? null,
    iniciada_por: iniciadaPor,
    espera_inicio_em: espera,
    humano_inicio_em: primeiroEvento("humano_inicio"),
    finalizada_em: finalizada,
    encerrada_por_tempo: eventos.some((e) => e.evento === "fim_por_tempo"),
    primeira_msg_cliente_em: primeiraCliente,
    primeira_resposta_em: primeiraRespostaEm,
    primeira_resposta_agente: primeiraRespostaAgente,
    primeira_resposta_vendedor_id: primeiraRespostaVendedor,
    primeira_resposta_seg:
      primeiraRespostaEm && inicioSla ? Math.max(0, Math.round((t(primeiraRespostaEm) - t(inicioSla)) / 1000)) : null,
    primeira_resposta_util_seg: primeiraRespostaEm && inicioSla ? util(inicioSla, primeiraRespostaEm) : null,
    cliente_sem_resposta: clienteSemResposta,
    transferencias: eventos.filter((e) => e.evento === "transferencia").length,
    msgs_cliente: contagem.cliente,
    msgs_agente: contagem.agente,
    msgs_automacao: contagem.automacao,
    msgs_sistema: contagem.sistema,
    cliente_por_dia: clientePorDia,
    por_agente: porAgente,
    vendedor_principal_id: principal?.vendedor_id ?? null,
    agente_principal: principal?.agente_nome ?? conversa.agenteNome,
  };
}
