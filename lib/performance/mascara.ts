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
