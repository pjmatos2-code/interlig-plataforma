/**
 * Vínculo caso de retenção → contrato e cliente — puro, testado em
 * vinculo.test.ts.
 *
 * Revisão de 27/10/2026: em outubro nenhum caso do robô ganhou contrato e a
 * auditoria (que só julga caso com contrato) deixou 36 deles em "novo". As
 * causas: o CPF da conversa era comparado só em dígitos, mas o cadastro grava
 * "000.000.000-00"; o telefone era procurado numa lista que o banco corta em
 * 1.000 clientes (de 15,5 mil); e o contrato cancelado DEPOIS da conversa — o
 * próprio desfecho do caso — ficava de fora da escolha.
 *
 * Revisão de 03/11/2026: casos repetidos. O caso manual da agente não tem
 * protocolo e quase nunca tem telefone, e o robô só reconhecia o mesmo
 * cliente pelo telefone idêntico (com e sem 55 eram "outro" cliente).
 */

export type ContratoRef = {
  status: string;
  data_venda: string | null;
  data_cancelamento: string | null;
};

const DIA = 86_400_000;
const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "");

function diaAnterior(dia: string): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) - DIA).toISOString().slice(0, 10);
}

/** Dia em que a conversa começou: o protocolo do SZ começa por AAAAMMDD. O
 *  caso pode nascer dias depois (o robô percorre o mês aos poucos). */
export function dataDaConversa(protocolo: string | null | undefined, reservaIso: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(protocolo ?? "");
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  return reservaIso.slice(0, 10);
}

/** Cancelado antes de a conversa começar (1 dia de folga) = contrato antigo do
 *  mesmo cliente, não o desfecho deste caso. */
export function canceladoAntesDaConversa(dataCancelamento: string | null, dataConversa: string): boolean {
  return !!dataCancelamento && dataCancelamento < diaAnterior(dataConversa);
}

function cpfValido(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** CPFs e CNPJs válidos citados na conversa, só dígitos, na ordem em que
 *  aparecem. O dígito verificador descarta telefone e CPF digitado errado (o
 *  cliente às vezes erra o primeiro e manda de novo). */
export function documentosDaConversa(texto: string): string[] {
  const achados = [...texto.matchAll(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/g)]
    .map((m) => soDigitos(m[0]))
    .filter((d) => cpfValido(d) || cnpjValido(d));
  return [...new Set(achados)];
}

/** Formatos em que o cadastro grava o documento (levantados em 27/10/2026:
 *  000.000.000-00 na maioria, mas também só dígitos e outras pontuações). */
export function variantesDocumento(d: string): string[] {
  if (d.length === 11)
    return [
      d,
      `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`,
      `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}.${d.slice(9)}`,
      `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`,
      `${d.slice(0, 6)}.${d.slice(6, 9)}-${d.slice(9)}`,
    ];
  if (d.length === 14) return [d, `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`];
  return [];
}

/** Nome do WhatsApp que serve para procurar o titular: sem emoji nem símbolo
 *  e com pelo menos duas palavras ("Kauan🥵" ou "😑" não servem). */
export function nomeParaBusca(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  return limpo.split(" ").filter((p) => p.length >= 2).length >= 2 ? limpo : null;
}

/**
 * Contrato do caso entre os do titular: o que existia na data da conversa —
 * de preferência o cancelado a partir dela (é o próprio desfecho); senão o
 * mais recente ainda não cancelado. Contrato vendido depois da conversa ou
 * cancelado antes dela não é deste caso.
 */
export function escolherContrato<T extends ContratoRef>(contratos: T[], dataConversa: string): T | null {
  const daEpoca = contratos.filter(
    (c) =>
      (!c.data_venda || c.data_venda <= dataConversa) &&
      (c.status !== "cancelado" ||
        (!!c.data_cancelamento && !canceladoAntesDaConversa(c.data_cancelamento, dataConversa)))
  );
  const cancelado = daEpoca
    .filter((c) => c.status === "cancelado")
    .sort((a, b) => String(a.data_cancelamento).localeCompare(String(b.data_cancelamento)))[0];
  if (cancelado) return cancelado;
  return (
    daEpoca
      .filter((c) => c.status !== "cancelado")
      .sort((a, b) => String(b.data_venda ?? "").localeCompare(String(a.data_venda ?? "")))[0] ?? null
  );
}

export type CasoRecente = {
  id: string;
  criado_em: string;
  telefone: string | null;
  cliente_nome: string | null;
  sgp_contrato_id: string | null;
};

/** Últimos 8 dígitos: o mesmo número com e sem 55 ou sem o 9º dígito. LID do
 *  WhatsApp (15+ dígitos) não é número de ninguém. */
function chaveTelefone(t: string | null | undefined): string | null {
  const d = soDigitos(t);
  return d.length >= 10 && d.length <= 13 ? d.slice(-8) : null;
}

/** Nome completo sem acento, só com 3+ palavras ("MARIA SILVA" é comum demais). */
function chaveNome(t: string | null | undefined): string | null {
  const p = (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return p.length >= 3 ? p.join(" ") : null;
}

/**
 * Caso já registrado do mesmo cliente — o mais recente, entre `casos` em
 * ordem decrescente de criação. Com `dias`, só os criados nessa janela (15
 * dias = a MESMA solicitação continuando). Mesmo contrato decide; contratos
 * diferentes são outro ponto/cliente; sem contrato dos dois lados, vale o
 * telefone e depois o nome completo.
 */
export function casoDoMesmoCliente<T extends CasoRecente>(
  alvo: { sgpContratoId: string | null; telefone: string | null; nome: string | null },
  casos: T[],
  janela?: { agoraMs: number; dias: number }
): T | null {
  const tel = chaveTelefone(alvo.telefone);
  const nome = chaveNome(alvo.nome);
  for (const k of casos) {
    if (janela && janela.agoraMs - Date.parse(k.criado_em) >= janela.dias * DIA) continue;
    if (alvo.sgpContratoId && k.sgp_contrato_id) {
      if (alvo.sgpContratoId === k.sgp_contrato_id) return k;
      continue;
    }
    if (tel && tel === chaveTelefone(k.telefone)) return k;
    if (nome && nome === chaveNome(k.cliente_nome)) return k;
  }
  return null;
}
