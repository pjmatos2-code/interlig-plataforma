import "server-only";
import { VALIDADE_PDF_MS, assinarPdf } from "./assinatura";

/**
 * PDF do relatório: o Chromium abre a página de impressão do próprio site
 * (/relatorios/pdf/<id>, mesmo visual da tela) e imprime em A4. Na Vercel
 * usa o Chromium para serverless (@sparticuz/chromium, que já traz a fonte
 * reserva Open Sans); no computador de desenvolvimento, o Chrome instalado.
 */

const CHROME_LOCAL = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/**
 * Origem pública do site, para o Chromium abrir a página e para o link do
 * e-mail. Na produção da Vercel, o domínio de produção: o endereço próprio de
 * cada deploy pode pedir login da Vercel. Fora dela, a do pedido.
 */
export function origemDoSite(urlDoPedido?: string): string {
  if (process.env.RELATORIO_ORIGEM) return process.env.RELATORIO_ORIGEM.replace(/\/$/, "");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (urlDoPedido) return new URL(urlDoPedido).origin;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function gerarPdfRelatorio(id: string, origem: string): Promise<Buffer> {
  const expiraEm = Date.now() + VALIDADE_PDF_MS;
  return imprimirPagina(`${origem}/relatorios/pdf/${id}?exp=${expiraEm}&sig=${assinarPdf(id, expiraEm)}`);
}

/** abre uma página do site no Chromium e imprime em A4 */
export async function imprimirPagina(url: string): Promise<Buffer> {
  const { default: puppeteer } = await import("puppeteer-core");
  let executablePath: string;
  let args: string[];
  if (process.env.VERCEL) {
    const { default: chromium } = await import("@sparticuz/chromium");
    chromium.setGraphicsMode = false;
    executablePath = await chromium.executablePath();
    args = await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" });
  } else {
    executablePath = process.env.CHROME_PATH || CHROME_LOCAL;
    args = ["--no-first-run", "--no-default-browser-check"];
  }
  const browser = await puppeteer.launch({
    executablePath,
    args,
    headless: process.env.VERCEL ? "shell" : true,
    defaultViewport: { width: 1000, height: 1400, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    const resposta = await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    if (!resposta || !resposta.ok()) throw new Error(`a página de impressão respondeu ${resposta?.status() ?? "sem resposta"}`);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      scale: 0.8,
      margin: { top: "12mm", right: "10mm", bottom: "14mm", left: "10mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;padding:0 10mm;font-family:Arial,sans-serif;font-size:7.5px;color:#6B7A99;display:flex;justify-content:space-between">' +
        '<span>Relatório Comercial Semanal · Interlig</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
      timeout: 60_000,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
