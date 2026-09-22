import "server-only";

/**
 * Extrator do relatório Serasa completo da Consult Center (PDF).
 *
 * Toda a extração é LOCAL (pdfjs, sem serviço externo — o relatório contém
 * dados pessoais). O parser trabalha com o texto posicionado do PDF:
 *  - o score vem EXCLUSIVAMENTE do padrão "Score NNN de 1000" (nunca do
 *    percentual, da faixa 401-500 do texto da Serasa ou da cor do gráfico);
 *  - a data de referência é a do bloco "Resultado da consulta" (não o
 *    horário de impressão do rodapé);
 *  - pendências: totais saem do RESUMO (Pefin/Refin/Protesto/Cheque/
 *    Cobrança) e o detalhamento alimenta só a lista de ocorrências — a
 *    mesma dívida aparece nos dois lugares e não pode contar duas vezes.
 */

export type OcorrenciaCredito = {
  data: string | null;      // dd/mm/aaaa
  modalidade: string | null;
  valor: number | null;
  contrato: string | null;
  credor: string | null;
  categoria: string;        // Pefin, Refin, Protesto…
};

export type DadosConsultCenter = {
  nomeTitular: string | null;
  cpf: string | null;              // 11 dígitos
  score: number | null;            // null = não identificado (≠ zero)
  consultaEm: string | null;       // ISO
  protocolo: string | null;
  codigoAssociado: string | null;
  unidadeDeclarada: string | null;
  pendenciasQtd: number;
  pendenciasValor: number;
  pendenciaRecente: string | null; // aaaa-mm-dd
  ocorrencias: OcorrenciaCredito[];
};

const MESES_PT: Record<string, string> = {
  janeiro: "01", fevereiro: "02", "março": "03", marco: "03", abril: "04",
  maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09",
  outubro: "10", novembro: "11", dezembro: "12",
};

const numeroBr = (t: string): number | null => {
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const dataBr = (t: string | null): string | null => {
  const m = t?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

type Item = { str: string; x: number; y: number; pagina: number };

/** Extrai os itens de texto com posição (pdfjs legacy, sem worker). */
async function extrairItens(pdf: Buffer): Promise<Item[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // registra o worker no globalThis: o pdfjs deixa de fazer o import dinâmico
  // interno (que o file tracing da Vercel não enxerga e quebrava no serverless)
  // @ts-expect-error módulo sem tipos — só executa pelo efeito colateral
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
  }).promise;
  const itens: Item[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    for (const it of conteudo.items as { str: string; transform: number[] }[]) {
      if (!it.str || !it.str.trim()) continue;
      itens.push({ str: it.str, x: it.transform[4], y: it.transform[5], pagina: p });
    }
  }
  await doc.cleanup?.();
  return itens;
}

/** Reconstroi linhas de texto por página/altura (tolerância de 2pt). */
function montarLinhas(itens: Item[]): { texto: string; itens: Item[] }[] {
  const grupos = new Map<string, Item[]>();
  for (const it of itens) {
    const chave = `${it.pagina}:${Math.round(it.y / 2)}`;
    const g = grupos.get(chave) ?? [];
    g.push(it);
    grupos.set(chave, g);
  }
  return [...grupos.entries()]
    .map(([chave, g]) => ({
      ordem: chave.split(":").map(Number),
      itens: g.sort((a, b) => a.x - b.x),
    }))
    .sort((a, b) => a.ordem[0] - b.ordem[0] || b.ordem[1] - a.ordem[1])
    .map((l) => ({ texto: l.itens.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(), itens: l.itens }));
}

/**
 * Nome do titular pela COLUNA do cabeçalho "NOME" (o relatório traz nome e
 * nome da mãe lado a lado; sem as posições não dá para separar os dois).
 * Falha vira null — nunca chutamos, e o nome da mãe não é usado para nada.
 */
function nomePorColuna(linhas: { texto: string; itens: Item[] }[]): string | null {
  for (let i = 0; i < linhas.length - 1; i++) {
    const cab = linhas[i];
    if (!/\bCPF\b/.test(cab.texto) || !/\bNOME\b/.test(cab.texto)) continue;
    const colNome = cab.itens.find((it) => it.str.trim() === "NOME");
    const colMae = cab.itens.find((it) => /NOME DA M[ÃA]E/.test(it.str));
    if (!colNome || !colMae) continue;
    const dados = linhas[i + 1];
    if (!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(dados.texto)) continue;
    const pedacos = dados.itens
      .filter((it) => it.x >= colNome.x - 4 && it.x < colMae.x - 4)
      .map((it) => it.str.trim())
      .filter((s) => s && !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(s));
    const nome = pedacos.join(" ").replace(/\s+/g, " ").trim();
    if (nome) return nome;
  }
  return null;
}

export async function extrairConsultCenter(pdf: Buffer): Promise<DadosConsultCenter> {
  const itens = await extrairItens(pdf);
  const linhas = montarLinhas(itens);
  const texto = linhas.map((l) => l.texto).join("\n");

  // score: só o padrão oficial — 86,50%, "401 - 500" e o gauge não servem
  const mScore = texto.match(/Score\s+(\d{1,4})\s+de\s+1[.\s]?000/i);
  const score = mScore ? Number(mScore[1]) : null;

  // CPF do titular: o primeiro CPF formatado do bloco de identificação
  const cpf = texto.match(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/);

  // "Resultado da consulta - Pessoa Física / Segunda, 21 de setembro de 2026 15:31:15"
  let consultaEm: string | null = null;
  const mData = texto.match(
    /Resultado da consulta[\s\S]{0,160}?(\d{1,2}) de ([a-zç]+) de (\d{4})[\s,]*(\d{2}:\d{2}:\d{2})?/i
  );
  if (mData) {
    const mes = MESES_PT[mData[2].toLowerCase()];
    if (mes) consultaEm = `${mData[3]}-${mes}-${mData[1].padStart(2, "0")}T${mData[4] ?? "00:00:00"}-03:00`;
  }

  const protocolo = texto.match(/Protocolo da Consulta:?\s*(\d+)/i)?.[1] ?? null;
  const mAssoc = texto.match(/C[óo]digo:\s*(\d+)\s*-\s*([^\n]+)/i);

  // ---- pendências: totais pelo RESUMO (nunca somar com o detalhamento) ----
  const CATEGORIAS = [
    ["Pendências Financeiras Pefin", "Pefin"],
    ["Pendências Financeiras Refin", "Refin"],
    ["Protesto Nacional", "Protesto"],
    ["Cheque Sem Fundo BACEN", "Cheque sem fundo"],
    ["Registros de Cobrança", "Cobrança"],
  ] as const;
  let pendenciasQtd = 0;
  let pendenciasValor = 0;
  let pendenciaRecente: string | null = null;
  for (const [rotulo] of CATEGORIAS) {
    // linha do resumo: "<rótulo> <qtd> R$ <valor> <última data>"
    const re = new RegExp(
      `${rotulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)\\s+R\\$\\s*([\\d.,]+)\\s+(\\d{2}/\\d{2}/\\d{4})`,
      "i"
    );
    const m = texto.match(re);
    if (!m) continue; // "NÃO CONSTAM OCORRÊNCIAS" ou seção ausente
    pendenciasQtd += Number(m[1]);
    pendenciasValor += numeroBr(m[2]) ?? 0;
    const d = dataBr(m[3]);
    if (d && (!pendenciaRecente || d > pendenciaRecente)) pendenciaRecente = d;
  }

  // ---- detalhamento: lista de ocorrências (credor/modalidade/contrato) ----
  const ocorrencias: OcorrenciaCredito[] = [];
  let categoriaAtual: string | null = null;
  for (const linha of linhas) {
    const t = linha.texto;
    const cab = CATEGORIAS.find(([rotulo]) => t.startsWith(rotulo) && !/R\$/.test(t));
    if (cab) { categoriaAtual = cab[1]; continue; }
    if (/^Total de Ocorr[êe]ncias/i.test(t) || /Registro de Consultas/i.test(t)) {
      categoriaAtual = null;
      continue;
    }
    if (!categoriaAtual) continue;
    // "15/06/2023 SERV DADOS Sim R$ 400,00 48992 MOV [PÇA]"
    const m = t.match(
      /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(Sim|N[ãa]o)\s+R\$\s*([\d.,]+)\s+(\S+)\s+(.+?)\s*$/i
    );
    if (!m) continue;
    ocorrencias.push({
      data: m[1],
      modalidade: m[2].trim(),
      valor: numeroBr(m[4]),
      contrato: m[5],
      credor: m[6].replace(/\s+P[ÇC]A$/i, "").trim() || null,
      categoria: categoriaAtual,
    });
  }

  return {
    nomeTitular: nomePorColuna(linhas),
    cpf: cpf ? `${cpf[1]}${cpf[2]}${cpf[3]}${cpf[4]}` : null,
    score: score !== null && score >= 0 && score <= 1000 ? score : null,
    consultaEm,
    protocolo,
    codigoAssociado: mAssoc?.[1] ?? null,
    unidadeDeclarada: mAssoc?.[2]?.trim().split(/\s{2,}|Seu IP/i)[0]?.trim() ?? null,
    pendenciasQtd,
    pendenciasValor,
    pendenciaRecente,
    ocorrencias,
  };
}
