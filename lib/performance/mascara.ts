/**
 * Minimização de dados pessoais (LGPD) — 24/10/2026.
 * Aplicada ANTES de gravar o texto das mensagens e antes de qualquer envio
 * ao provedor de IA. Troca por marcadores: CPF, CNPJ, telefone, e-mail,
 * CEP, cartão/números longos e o nome do contato. Valores de plano
 * ("800 Mb", "R$ 99,90", "1 Giga") e números curtos (nº da casa) ficam.
 * Arquivo puro: testado em mascara.test.ts.
 */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

const PADROES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[EMAIL]"],
  // coordenadas de localização enviadas pelo cliente (lat, lng)
  [/-?\b\d{1,2}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/g, "[LOCALIZAÇÃO]"],
  // links de mapa
  [/https?:\/\/(maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl|www\.google\.com\/maps)\S*/gi, "[LOCALIZAÇÃO]"],
  // CNPJ antes do CPF (o CPF casaria um pedaço dele)
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]"],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]"],
  [/\b\d{11}\b/g, "[CPF/TELEFONE]"],
  // telefone: +55, DDD entre parênteses ou não, 8–9 dígitos com ou sem hífen
  [/(\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}\b/g, "[TELEFONE]"],
  [/\b9\d{4}-?\d{4}\b/g, "[TELEFONE]"],
  [/\b\d{5}-\d{3}\b/g, "[CEP]"],
  // cartão, protocolo, linha digitável… qualquer sequência longa de dígitos
  [/\b(?:\d[ .-]?){12,}\d\b/g, "[NÚMERO]"],
  [/\b\d{8,10}\b/g, "[NÚMERO]"],
];

/** tokens do nome do contato que merecem máscara (≥ 3 letras, sem conectivos) */
function tokensDoNome(nomes: (string | null | undefined)[]): string[] {
  const conectivos = new Set(["das", "dos", "del", "von", "van"]);
  const tokens = new Set<string>();
  for (const nome of nomes) {
    for (const t of semAcento(nome ?? "").toLowerCase().split(/[^a-z]+/)) {
      if (t.length >= 3 && !conectivos.has(t)) tokens.add(t);
    }
  }
  return [...tokens];
}

export function mascararTexto(texto: string, nomesDoContato: (string | null | undefined)[] = []): string {
  let saida = texto.normalize("NFC");
  for (const [re, marca] of PADROES) saida = saida.replace(re, marca);
  const tokens = tokensDoNome(nomesDoContato);
  if (tokens.length) {
    // compara sem acento, mas preserva o resto do texto como veio: a versão
    // de busca tem exatamente o mesmo comprimento (caractere que mudaria de
    // tamanho ao tirar o acento vira "#")
    const base = Array.from(saida)
      .map((ch) => {
        const b = semAcento(ch).toLowerCase();
        return b.length === ch.length ? b : "#".repeat(ch.length);
      })
      .join("");
    const trechos: [number, number][] = [];
    for (const t of tokens) {
      const re = new RegExp(`\\b${t}\\b`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(base))) trechos.push([m.index, m.index + t.length]);
    }
    trechos.sort((a, b) => b[0] - a[0]);
    for (const [a, b] of trechos) saida = saida.slice(0, a) + "[CLIENTE]" + saida.slice(b);
  }
  return saida;
}

/**
 * Ocultação na EXIBIÇÃO (24/10/2026): nome do cliente do lead e bairros que
 * escaparam da máscara da coleta (o cliente digita o nome de um jeito, o
 * WhatsApp mostra outro). Uma regex só para todos os termos — a lista de
 * bairros é longa — comparando sem acento e só em palavra inteira.
 */
export function criarOcultador(termos: string[], troca = "[omitido]"): (texto: string) => string {
  const limpos = [...new Set(termos.map((t) => semAcento(t.trim()).toLowerCase()).filter((t) => t.length >= 4))].sort((a, b) => b.length - a.length);
  if (!limpos.length) return (texto) => texto;
  const re = new RegExp(`\\b(?:${limpos.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  return (texto) => {
    if (!texto) return texto;
    // versão sem acento com o MESMO comprimento (posições batem com o original)
    const base = Array.from(texto)
      .map((ch) => {
        const b = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return b.length === ch.length ? b : "#".repeat(ch.length);
      })
      .join("");
    let saida = "";
    let ultimo = 0;
    re.lastIndex = 0;
    for (let m = re.exec(base); m; m = re.exec(base)) {
      saida += texto.slice(ultimo, m.index) + troca;
      ultimo = m.index + m[0].length;
    }
    return saida + texto.slice(ultimo);
  };
}

const PERGUNTA_NOME = /\b(qual|como)\b[^?.!\n]{0,25}\bnome\b|\bseu nome\b|\bse chama\b|\bcom quem (eu )?(falo|estou falando)\b/i;
const NAO_NOME = new Set(["sou", "meu", "minha", "nome", "aqui", "olá", "ola", "oi", "bom", "boa", "dia", "tarde", "noite", "com", "falo", "prazer", "tudo", "bem", "sim", "não", "nao", "obrigado", "obrigada", "fala", "quem", "esse", "este", "isso", "senhor", "senhora", "dona"]);

/**
 * Nome que o cliente DIGITOU quando o vendedor perguntou ("qual o seu nome?")
 * — costuma ser diferente do nome do WhatsApp e do cadastro. Resposta curta,
 * sem número; devolve as palavras para o ocultador.
 */
export function nomesInformadosNaConversa(mensagens: { autor: string; texto: string | null }[]): string[] {
  const nomes = new Set<string>();
  for (let i = 0; i < mensagens.length - 1; i++) {
    const m = mensagens[i];
    if (m.autor !== "agente" || !m.texto || !PERGUNTA_NOME.test(m.texto)) continue;
    const resposta = mensagens.slice(i + 1, i + 4).find((x) => x.autor === "cliente" && x.texto);
    const texto = resposta?.texto?.trim() ?? "";
    if (!texto || /\d/.test(texto)) continue;
    const palavras = texto.replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
    if (!palavras.length || palavras.length > 6) continue;
    for (const p of palavras) if (p.length >= 3 && !NAO_NOME.has(semAcento(p).toLowerCase())) nomes.add(p);
  }
  return [...nomes];
}
