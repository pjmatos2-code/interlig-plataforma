import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Relatórios executivos em PDF com a identidade Interlig — versão enxuta:
 * cabeçalho marinho com logo, seções, linhas rótulo/valor e tabela simples.
 * Usado pelos PDFs gerais (equipe técnica, gerência, apuração comercial).
 */

export const MARINHO = rgb(0.039, 0.086, 0.22);
export const AZUL = rgb(0.016, 0.216, 0.573);
export const CEU = rgb(0.016, 0.486, 0.867);
export const CINZA = rgb(0.42, 0.45, 0.5);
export const CINZA_CLARO = rgb(0.93, 0.94, 0.96);
export const TEXTO = rgb(0.1, 0.12, 0.16);
export const VERDE = rgb(0.11, 0.55, 0.32);
export const VERMELHO = rgb(0.76, 0.13, 0.28);

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 44;
const LARGURA = A4[0] - MARGEM * 2;

export const moedaPdf = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const limpar = (t: string) =>
  (t ?? "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export class RelatorioPdf {
  private doc!: PDFDocument;
  private regular!: PDFFont;
  private negrito!: PDFFont;
  private pagina!: PDFPage;
  private y = 0;
  private titulo = "";
  private subtitulo = "";
  private logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;

  static async criar(titulo: string, subtitulo: string): Promise<RelatorioPdf> {
    const r = new RelatorioPdf();
    r.doc = await PDFDocument.create();
    r.regular = await r.doc.embedFont(StandardFonts.Helvetica);
    r.negrito = await r.doc.embedFont(StandardFonts.HelveticaBold);
    r.doc.setTitle(titulo);
    r.doc.setAuthor("Interlig Internet Fibra");
    r.doc.setProducer("Plataforma de Inteligência Comercial Interlig");
    r.titulo = titulo;
    r.subtitulo = subtitulo;
    try {
      const bytes = await readFile(path.join(process.cwd(), "public/marca/logo-fundo-escuro.png"));
      r.logo = await r.doc.embedPng(bytes);
    } catch {
      r.logo = null;
    }
    r.novaPagina();
    return r;
  }

  private cabecalho() {
    this.pagina.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: MARINHO });
    if (this.logo) {
      const w = 76;
      const h = (this.logo.height / this.logo.width) * w;
      this.pagina.drawImage(this.logo, { x: MARGEM, y: A4[1] - 40 - h / 2, width: w, height: h });
    }
    this.pagina.drawText(limpar(this.titulo), {
      x: MARGEM + 92, y: A4[1] - 44, size: 15, font: this.negrito, color: rgb(1, 1, 1),
    });
    this.pagina.drawText(limpar(this.subtitulo), {
      x: MARGEM + 92, y: A4[1] - 62, size: 9.5, font: this.regular, color: rgb(0.75, 0.82, 0.95),
    });
  }

  private rodape() {
    this.pagina.drawRectangle({ x: 0, y: 0, width: A4[0], height: 24, color: MARINHO });
    this.pagina.drawText("Interlig Internet Fibra - Plataforma de Inteligência Comercial", {
      x: MARGEM, y: 8, size: 7.5, font: this.regular, color: rgb(0.75, 0.82, 0.95),
    });
    const data = new Date().toLocaleString("pt-BR", { timeZone: "America/Santarem" });
    const t = limpar(`Emitido em ${data}`);
    this.pagina.drawText(t, {
      x: A4[0] - MARGEM - this.regular.widthOfTextAtSize(t, 7.5),
      y: 8, size: 7.5, font: this.regular, color: rgb(0.75, 0.82, 0.95),
    });
  }

  novaPagina() {
    if (this.pagina) this.rodape();
    this.pagina = this.doc.addPage(A4);
    this.cabecalho();
    this.y = A4[1] - 120;
  }

  private garantir(altura: number) {
    if (this.y - altura < 50) this.novaPagina();
  }

  secao(titulo: string) {
    this.garantir(34);
    this.y -= 6;
    this.pagina.drawRectangle({ x: MARGEM, y: this.y - 3, width: 3, height: 13, color: CEU });
    this.pagina.drawText(limpar(titulo), { x: MARGEM + 9, y: this.y, size: 11, font: this.negrito, color: AZUL });
    this.y -= 20;
  }

  linha(rotulo: string, valor: string, destaque = false) {
    this.garantir(16);
    const f = destaque ? this.negrito : this.regular;
    this.pagina.drawText(limpar(rotulo), { x: MARGEM, y: this.y, size: 9.5, font: f, color: destaque ? MARINHO : TEXTO });
    const t = limpar(valor);
    this.pagina.drawText(t, {
      x: A4[0] - MARGEM - f.widthOfTextAtSize(t, 9.5),
      y: this.y, size: 9.5, font: f, color: destaque ? MARINHO : TEXTO,
    });
    this.y -= 15;
  }

  destaqueValor(rotulo: string, valor: string, cor = VERDE) {
    this.garantir(56);
    this.pagina.drawRectangle({ x: MARGEM - 4, y: this.y - 34, width: LARGURA + 8, height: 48, color: CINZA_CLARO });
    this.pagina.drawText(limpar(rotulo), { x: MARGEM + 6, y: this.y - 2, size: 9.5, font: this.regular, color: CINZA });
    this.pagina.drawText(limpar(valor), { x: MARGEM + 6, y: this.y - 24, size: 18, font: this.negrito, color: cor });
    this.y -= 54;
  }

  nota(texto: string) {
    this.garantir(14);
    // quebra simples por largura
    const palavras = limpar(texto).split(" ");
    let atual = "";
    const linhas: string[] = [];
    for (const p of palavras) {
      const tent = atual ? `${atual} ${p}` : p;
      if (this.regular.widthOfTextAtSize(tent, 8.5) > LARGURA - 8) {
        linhas.push(atual);
        atual = p;
      } else atual = tent;
    }
    if (atual) linhas.push(atual);
    for (const l of linhas) {
      this.garantir(12);
      this.pagina.drawText(l, { x: MARGEM, y: this.y, size: 8.5, font: this.regular, color: CINZA });
      this.y -= 11;
    }
    this.y -= 3;
  }

  /** tabela simples: colunas [{titulo, largura(0-1), alinhaDireita?}] */
  tabela(
    colunas: { titulo: string; largura: number; direita?: boolean }[],
    linhas: string[][],
    rodapeLinha?: string[]
  ) {
    const xDe = (i: number) =>
      MARGEM + colunas.slice(0, i).reduce((s, c) => s + c.largura, 0) * LARGURA;
    const desenhaLinha = (valores: string[], f: PDFFont, cor = TEXTO) => {
      this.garantir(16);
      valores.forEach((v, i) => {
        const col = colunas[i];
        const t = limpar(v);
        const tamanho = 8.5;
        const largCol = col.largura * LARGURA;
        let texto = t;
        while (texto.length > 1 && f.widthOfTextAtSize(texto, tamanho) > largCol - 8) texto = texto.slice(0, -1);
        const x = col.direita
          ? xDe(i) + largCol - 4 - f.widthOfTextAtSize(texto, tamanho)
          : xDe(i) + 4;
        this.pagina.drawText(texto, { x, y: this.y, size: tamanho, font: f, color: cor });
      });
      this.y -= 14;
    };

    // cabeçalho
    this.garantir(20);
    this.pagina.drawRectangle({ x: MARGEM, y: this.y - 4, width: LARGURA, height: 15, color: CINZA_CLARO });
    desenhaLinha(colunas.map((c) => c.titulo), this.negrito, MARINHO);
    for (const l of linhas) desenhaLinha(l, this.regular);
    if (rodapeLinha) {
      this.pagina.drawLine({
        start: { x: MARGEM, y: this.y + 10 },
        end: { x: A4[0] - MARGEM, y: this.y + 10 },
        thickness: 0.6,
        color: CINZA,
      });
      desenhaLinha(rodapeLinha, this.negrito, MARINHO);
    }
    this.y -= 6;
  }

  async bytes(): Promise<Uint8Array> {
    this.rodape();
    return this.doc.save();
  }
}
