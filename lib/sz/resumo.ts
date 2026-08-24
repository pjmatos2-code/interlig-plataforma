import "server-only";
import type { Conversa } from "@/lib/sz/conversas";

export type PlanoRef = { id: string; nome: string; velocidade: string | null };

export type ResumoIa = {
  resumo: string;
  proxima: string;
  urgencia: "alta" | "media" | "baixa";
  /** conversa indica venda concluída (assinou / plano ativado) */
  vendaFechada: boolean;
  /** plano detectado na conversa (para fechar como convertido) */
  planoId: string | null;
  /** nº do contrato SGP citado na frase de fechamento (para reconciliar) */
  contratoSgpId: string | null;
};

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const CIDADES = [
  "Altamira", "Vitória do Xingu", "Vitoria do Xingu", "Brasil Novo", "Santarém",
  "Rurópolis", "Uruará", "Placas", "Divinópolis", "Campo Verde",
];

function horasEntre(a: string, b: string): number {
  const pa = Date.parse(a.replace(" ", "T"));
  const pb = Date.parse(b.replace(" ", "T"));
  return Number.isFinite(pa) && Number.isFinite(pb) ? Math.abs(pb - pa) / 3_600_000 : 0;
}

/** Detecta o plano citado pela vendedora e casa com o catálogo. */
function detectarPlano(textoAgente: string, planos: PlanoRef[]): PlanoRef | null {
  const t = textoAgente.toLowerCase();
  // 1 GIGA / 1GB / speedmax
  if (/\b1\s*g(b|iga)\b|speedmax|1\s*gb/.test(t)) {
    return planos.find((p) => /1gb|speedmax|giga/i.test(p.nome)) ?? null;
  }
  // velocidades em MB (400, 500, 600, 800…)
  const mb = t.match(/\b(200|300|400|500|600|700|800|900)\s*(mb|mega)/);
  if (mb) {
    const v = mb[1];
    return (
      planos.find((p) => (p.velocidade ?? "").includes(v) || p.nome.includes(v)) ?? null
    );
  }
  if (/gamer|gaming/.test(t)) return planos.find((p) => /gamer/i.test(p.nome)) ?? null;
  return null;
}

/**
 * Resumo por regras (sem IA paga). Lê o diálogo e monta um panorama acionável:
 * cidade, PF/PJ, plano, etapa em que parou, quem espera e há quanto tempo.
 * Regras de urgência definidas pelo gestor (23/08).
 */
export function resumirPorRegras(
  c: Conversa,
  planos: PlanoRef[],
  opts: { marcadorFechamento?: string } = {}
): ResumoIa {
  const msgs = c.dialogo;
  const doCliente = msgs.filter((m) => m.quem === "CLIENTE");
  const doAgente = msgs.filter((m) => m.quem === "AGENTE");
  const uteis = msgs.filter((m) => m.quem !== "SISTEMA" && m.quem !== "IA");
  const ultima = uteis[uteis.length - 1];
  const textoAgente = doAgente.map((m) => m.texto).join("  ");
  const textoTudo = msgs.map((m) => m.texto).join("  ");
  const temAgente = (re: RegExp) => re.test(textoAgente);

  // ---- sinais ----
  const cidade =
    c.equipe.replace("Comercial ", "") ||
    CIDADES.find((cid) => new RegExp(cid, "i").test(textoTudo)) ||
    null;
  const pj = /\b(empresa|cnpj|\bpj\b|corporativ|licita|jucepa|ltda|\bepp\b|órgão|orgao)\b/i.test(textoTudo);
  const disp = textoTudo.match(/(\d{1,2})\s*(dispositivos|aparelhos|celular)/i)?.[1] ?? null;
  const planoRef = detectarPlano(textoAgente, planos);
  const planoMostrado = temAgente(/plano|recomendo|R\$|mensalidade|fibra\s*\d|speedmax|giga/i) || !!planoRef;
  const pediuEndereco = temAgente(/endere[çc]o|localiza[çc][ãa]o|cobertura|viabilidade|qual bairro/i);
  const deuEndereco =
    /\b(rua|av\.?|avenida|travessa|bairro|n[ºo°]|maps\.google|maps\?q=)/i.test(
      doCliente.map((m) => m.texto).join("  ")
    );
  const pediuDoc = temAgente(/documento|identidade|\brg\b|frente e verso|foto do seu doc/i);
  const linkAssinatura = temAgente(/assinatura_eletronica|assina esse|link de assinatura|assinar o contrato/i);
  // frase-sentinela de fechamento (configurável) — detecção de alta confiança
  const marcador = semAcento(opts.marcadorFechamento || "venda concluida");
  const msgFechamento = doAgente.find((m) => semAcento(m.texto).includes(marcador));
  let planoDaFrase: PlanoRef | null = null;
  let contratoSgpId: string | null = null;
  if (msgFechamento) {
    const planoTxt = msgFechamento.texto.match(/plano\s*[:\-]\s*([^|\n]+)/i)?.[1] ?? "";
    if (planoTxt) planoDaFrase = detectarPlano(planoTxt, planos);
    contratoSgpId = msgFechamento.texto.match(/contrato\s*[:\-]?\s*#?\s*(\d{3,7})/i)?.[1] ?? null;
  }
  const vendaFechada =
    !!msgFechamento ||
    /parab[ée]ns.*(interlig|plano)|bem[- ]vind[oa].*(interlig|fam[íi]lia)|contrato ativad|instala[çc][ãa]o agendad/i.test(
      textoAgente
    ) ||
    (linkAssinatura && /assinei|assinado|j[áa] assin|prontinho|feito.*assin/i.test(doCliente.map((m) => m.texto).join("  ")));

  const clienteEsperando = ultima?.quem === "CLIENTE";
  const abandonou =
    /encerrou o atendimento|finalizad[oa] por inatividade|sess[ãa]o.*expir/i.test(textoTudo) &&
    doCliente.length <= 2;
  const semResposta = doCliente.length === 0 || (doAgente.length > 0 && doCliente.length <= 1 && !planoMostrado);

  // espera até o 1º atendimento humano
  const primeiroAgente = doAgente[0]?.hora;
  const inicio = msgs[0]?.hora;
  const esperaH = primeiroAgente && inicio ? horasEntre(inicio, primeiroAgente) : 0;
  const esperaLonga = esperaH >= 3;

  // ---- etapa em que a conversa parou ----
  let etapa: string;
  if (vendaFechada) etapa = "venda fechada";
  else if (linkAssinatura) etapa = "contrato enviado, aguardando assinatura";
  else if (pediuDoc) etapa = "coletando documentos";
  else if (pediuEndereco) etapa = deuEndereco ? "verificando viabilidade do endereço" : "aguardando o endereço para viabilidade";
  else if (planoMostrado) etapa = "plano apresentado, em negociação";
  else if (doCliente.length > 0) etapa = "qualificação inicial";
  else etapa = "aguardando primeira resposta do cliente";

  // ---- urgência (regras do gestor) ----
  let urgencia: ResumoIa["urgencia"];
  if (vendaFechada) urgencia = "baixa";
  else if ((linkAssinatura && !vendaFechada) || clienteEsperando || pj || esperaLonga) urgencia = "alta";
  else if (abandonou || semResposta) urgencia = "baixa";
  else urgencia = "media";

  // ---- textos ----
  const perfil = pj ? "cliente PJ/empresa" : "cliente residencial";
  const partes = [
    `${perfil} de ${cidade ?? "—"}`,
    c.agente ? `com ${c.agente.split(" ").slice(0, 2).join(" ")}` : null,
    disp ? `${disp} dispositivos` : null,
    planoRef ? `interesse em ${planoRef.nome.replace(/\s*\|.*/, "")}` : null,
  ].filter(Boolean);
  let resumo = `${partes.join(", ")}. Parou em: ${etapa}.`;
  if (esperaLonga) resumo += ` ⏱ Esperou ~${Math.round(esperaH)}h pelo 1º atendimento.`;
  if (clienteEsperando && !vendaFechada) resumo += " Cliente aguardando resposta.";
  if (pj) resumo += " Conta corporativa — priorizar proposta formal.";

  let proxima: string;
  if (vendaFechada) proxima = "Venda concluída — confirmar ativação/reconciliação no SGP.";
  else if (linkAssinatura) proxima = "Cobrar a assinatura do contrato e acompanhar até ativar.";
  else if (pediuEndereco && !deuEndereco) proxima = "Retomar pedindo o endereço/localização para checar viabilidade.";
  else if (pediuDoc) proxima = "Coletar o documento e emitir o link de assinatura.";
  else if (planoMostrado) proxima = pj
    ? "Enviar proposta corporativa formal (CNPJ, prazo, SLA) e manter follow-up diário."
    : "Retomar a negociação e conduzir para o fechamento do contrato.";
  else if (semResposta || abandonou) proxima = "Reabordar com mensagem curta oferecendo os planos mais vendidos.";
  else proxima = "Dar sequência à qualificação e recomendar o plano ideal.";

  return {
    resumo: resumo.slice(0, 800),
    proxima,
    urgencia,
    vendaFechada,
    planoId: (planoDaFrase ?? planoRef)?.id ?? null,
    contratoSgpId,
  };
}
