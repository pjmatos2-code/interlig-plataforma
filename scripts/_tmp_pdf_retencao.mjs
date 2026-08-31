import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARINHO = rgb(0.039, 0.086, 0.22), AZUL = rgb(0.016, 0.216, 0.573),
  CEU = rgb(0.016, 0.486, 0.867), CINZA = rgb(0.42, 0.45, 0.5),
  CINZA_CLARO = rgb(0.93, 0.94, 0.96), TEXTO = rgb(0.1, 0.12, 0.16),
  VERDE = rgb(0.11, 0.55, 0.32), AMBAR = rgb(0.72, 0.45, 0.05);
const A4 = [595.28, 841.89], M = 44, W = A4[0] - M * 2;
const moeda = v => `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const limpar = t => (t ?? "").normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

const doc = await PDFDocument.create();
const reg = await doc.embedFont(StandardFonts.Helvetica);
const neg = await doc.embedFont(StandardFonts.HelveticaBold);
doc.setTitle("Comissão do Setor de Retenção — Regras e Projeção — agosto/2026");
doc.setAuthor("Interlig Internet Fibra");
doc.setProducer("Plataforma de Inteligência Comercial Interlig");
let logo = null;
try { logo = await doc.embedPng(await readFile("public/marca/logo-fundo-escuro.png")); } catch {}

let pg = doc.addPage(A4); let y;
const texto = (t, x, yy, tam, fonte = reg, cor = TEXTO) => pg.drawText(limpar(t), { x, y: yy, size: tam, font: fonte, color: cor });

function cabecalho(sub) {
  pg.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: MARINHO });
  if (logo) { const d = logo.scale(76 / logo.width); pg.drawImage(logo, { x: M, y: A4[1] - 62, width: d.width, height: d.height }); }
  texto("Comissão do Setor de Retenção", M + 92, A4[1] - 44, 15, neg, rgb(1, 1, 1));
  texto(sub, M + 92, A4[1] - 62, 9.5, reg, rgb(0.75, 0.82, 0.95));
  y = A4[1] - 120;
}
function secao(t) {
  y -= 8;
  pg.drawRectangle({ x: M, y: y - 3, width: 3, height: 13, color: CEU });
  texto(t, M + 9, y, 11, neg, AZUL); y -= 18;
}
function paragrafo(t, tam = 9.3, esq = M, larg = W, cor = TEXTO, fonte = reg, alt = 12.5) {
  const palavras = limpar(t).split(" "); let linha = "";
  for (const p of palavras) {
    const tent = linha ? `${linha} ${p}` : p;
    if (fonte.widthOfTextAtSize(tent, tam) > larg) { texto(linha, esq, y, tam, fonte, cor); y -= alt; linha = p; }
    else linha = tent;
  }
  if (linha) { texto(linha, esq, y, tam, fonte, cor); y -= alt; }
}
function item(t) { texto("•", M + 4, y, 9.3, neg, CEU); paragrafo(t, 9.3, M + 14, W - 14); y -= 1; }

cabecalho("Regras vigentes e projeção da competência - agosto de 2026 - Sandryne Souza");

secao("Como funciona");
paragrafo("A comissão do setor é paga sobre a TAXA de retenção, não sobre a quantidade de casos. Os casos nascem automaticamente do canal \"Cancelamento Altamira\" do SZ Chat (com entrada manual para telefone e loja) e a plataforma valida cada desfecho no SGP: contrato ativo = retido, cancelado = perdido, suspenso = em risco. A agente registra a tratativa no ticket; quem carimba o resultado é o status real do contrato.");
y -= 4;

secao("A conta");
item("Taxa = retidos / elegíveis. Elegíveis = retidos + perdidos + em risco + irreversíveis ainda não aprovados.");
item("Irreversível (mudança de cidade, inviabilidade técnica, óbito) só sai da conta DEPOIS de aprovado pela gestão, com análise da conversa ou evidência. Enquanto pendente, pesa contra a taxa.");
item("Piso de 15 casos elegíveis no mês — abaixo disso a avaliação é manual.");
item("Base de cálculo = VTV retido (soma do valor MENSAL dos contratos retidos). Comissão = % da faixa x VTV retido.");
y -= 4;

secao("Faixas por taxa de retenção");
const faixas = [["abaixo de 50%", "0%", "sem comissão"], ["50% a 64%", "10%", "sobre o VTV retido"], ["65% a 74%", "15%", "sobre o VTV retido"], ["75% a 84%", "20%", "sobre o VTV retido"], ["85% ou mais", "30%", "sobre o VTV retido"]];
const cols = [M, M + 150, M + 230]; 
pg.drawRectangle({ x: M - 4, y: y - 4, width: W + 8, height: 15, color: CINZA_CLARO });
texto("Taxa do mês", cols[0], y, 8.5, neg, CINZA); texto("Comissão", cols[1], y, 8.5, neg, CINZA); texto("Base", cols[2], y, 8.5, neg, CINZA); y -= 16;
for (const [a, b, c] of faixas) {
  texto(a, cols[0], y, 9.3, reg); texto(b, cols[1], y, 9.3, neg, b === "0%" ? CINZA : VERDE); texto(c, cols[2], y, 9.3, reg, CINZA); y -= 14;
}
y -= 4;

secao("Ajustes e proteções");
item("Clawback: cliente retido que cancela em até 30 dias vira estorno na competência seguinte.");
item("Em risco (suspenso): não paga agora, mas vira retido automaticamente se o cliente reativar/pagar até o fechamento.");
item("Reincidência: o mesmo cliente em até 15 dias não abre caso novo — continua no ticket original.");
item("Reabertura: apenas a gestão reabre um caso encerrado, com motivo registrado no ticket.");
y -= 4;

secao("Projeção de agosto/2026 (posição atual, antes do fechamento)");
const linhas = [
  ["Casos no mês", "91"], ["Retidos (validados no SGP)", "44"], ["Perdidos", "15"],
  ["Em risco (suspensos)", "9"], ["Irreversíveis aprovados pela gestão (fora da conta)", "22"],
  ["Clawback (estorna em setembro)", "1"], ["Elegíveis", "68"],
];
for (const [a, b] of linhas) { texto(a, M, y, 9.3, reg); texto(b, M + 330, y, 9.3, neg); y -= 14; }
y -= 2;
pg.drawRectangle({ x: M - 4, y: y - 40, width: W + 8, height: 52, color: CINZA_CLARO });
texto("Taxa: 64,7%  (44 de 68)", M + 6, y - 2, 11, neg, AZUL);
texto(`Faixa: 10%   ·   VTV retido: ${moeda(5275.6)}`, M + 6, y - 18, 10, reg, TEXTO);
texto(`Comissão projetada: ${moeda(527.56)}`, M + 6, y - 34, 12, neg, VERDE);
y -= 58;
pg.drawRectangle({ x: M - 4, y: y - 44, width: W + 8, height: 56, color: rgb(0.996, 0.95, 0.85) });
texto("A 0,3 ponto da próxima faixa:", M + 6, y - 2, 9.5, neg, AMBAR);
y -= 16;
paragrafo("Um único retido a mais (por exemplo, um dos 9 clientes em risco reativando) leva a taxa a 65,2% - faixa de 15% - comissão de R$ 791,34. Vale uma última investida nos 9 suspensos antes do fechamento.", 9, M + 6, W - 12, TEXTO, reg, 12);
y -= 22;

texto("Documento informativo gerado pela Plataforma de Inteligência Comercial em 31/08/2026.", M, 52, 8, reg, CINZA);
texto("O valor oficial é o do Demonstrativo de Comissão emitido no fechamento da competência.", M, 41, 8, reg, CINZA);
pg.drawRectangle({ x: 0, y: 0, width: A4[0], height: 26, color: MARINHO });
texto("Interlig Internet Fibra - Inteligência Comercial", M, 9, 8, reg, rgb(0.75, 0.82, 0.95));

await writeFile(process.argv[2], await doc.save());
console.log("pdf ok:", process.argv[2]);
