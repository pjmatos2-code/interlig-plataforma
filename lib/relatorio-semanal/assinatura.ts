import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link assinado da página de impressão do relatório (/relatorios/pdf/<id>):
 * é a página que o Chromium do servidor abre para gerar o PDF, sem sessão.
 * A assinatura vale por poucos minutos e usa o CRON_SECRET como chave — o
 * link não serve para compartilhar e expira logo depois de usado.
 */

export const VALIDADE_PDF_MS = 10 * 60_000;

function chave(segredo?: string): string {
  const s = segredo ?? process.env.CRON_SECRET;
  if (!s) throw new Error("CRON_SECRET não configurado: sem ele não há como assinar o link do PDF.");
  return s;
}

export function assinarPdf(id: string, expiraEm: number, segredo?: string): string {
  return createHmac("sha256", chave(segredo)).update(`relatorio-pdf:${id}:${expiraEm}`).digest("hex");
}

export function conferirAssinaturaPdf(
  id: string,
  expiraEm: string | undefined,
  assinatura: string | undefined,
  agora = Date.now(),
  segredo?: string
): boolean {
  if (!expiraEm || !assinatura || !/^\d{10,16}$/.test(expiraEm) || !/^[0-9a-f]{64}$/.test(assinatura)) return false;
  const exp = Number(expiraEm);
  // vencido, ou com validade maior que a que a plataforma dá
  if (exp < agora || exp - agora > VALIDADE_PDF_MS + 60_000) return false;
  let esperado: string;
  try {
    esperado = assinarPdf(id, exp, segredo);
  } catch {
    return false;
  }
  return timingSafeEqual(Buffer.from(esperado, "hex"), Buffer.from(assinatura, "hex"));
}
