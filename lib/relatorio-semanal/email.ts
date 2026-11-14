import type { DadosRelatorio, TextosRelatorio } from "./tipos";
import { contagemStatus } from "./placar";
import { dataBr, diaMes, rotuloSemanaCurto, type Semana } from "./periodo";
import { lista, num, pct, plural, reaisMil } from "./formato";

/**
 * O e-mail do relatório (funções puras): assunto, corpo em texto e em HTML,
 * no formato do e-mail que o Paulo aprovou — abertura com o nome do CEO, as
 * cinco linhas do resumo (melhor e pior indicador, base, críticos, o que
 * decidir) e o fecho com o PDF em anexo.
 *
 * Sem link para a plataforma (decisão do Paulo, 04/11/2026): o PDF anexado é
 * o relatório completo e quem recebe não precisa de login. As respostas da
 * reunião o comercial registra na plataforma, e o combinado aparece no
 * relatório da semana seguinte.
 */

export type EmailRelatorio = { assunto: string; texto: string; html: string; arquivo: string };
export type EmailSimples = Omit<EmailRelatorio, "arquivo">;

const EXTENSO = ["Nenhum", "Um", "Dois", "Três", "Quatro", "Cinco", "Seis", "Sete", "Oito", "Nove", "Dez"];

/** as linhas do resumo: as do Claude; sem os textos, um resumo só com os números */
export function linhasDoResumo(d: DadosRelatorio, t: TextosRelatorio | null): string[] {
  const doClaude = t?.email ? [t.email.melhor, t.email.pior, t.email.base, t.email.criticos, t.email.decidir].map((s) => (s ?? "").trim()).filter(Boolean) : [];
  if (doClaude.length) return doClaude;
  const c = contagemStatus(d.placar);
  const v = d.vendas;
  const criticos = d.placar.filter((p) => p.status === "critico").map((p) => p.indicador);
  return [
    `Vendas: ${plural(v.semana, "venda nova", "vendas novas")} na semana e ${num(v.mes)} no mês${v.metaMes ? `, ${pct(v.mes / v.metaMes)} da meta de ${num(v.metaMes)}` : ""}.`,
    `Base de ativos: ${num(d.base.ativos)} hoje, faltam ${num(Math.max(0, d.base.faltam))} para ${num(d.base.meta)}.`,
    `Fila de débito: ${plural(d.debito.clientes, "cliente", "clientes")} e ${reaisMil(d.debito.emRisco)}/mês em risco, ${num(d.debito.contatados7d)} contatados em 7 dias.`,
    criticos.length
      ? `${EXTENSO[c.critico] ?? num(c.critico)} dos dez indicadores ${c.critico === 1 ? "está crítico" : "estão críticos"}: ${lista(criticos)}.`
      : "Nenhum dos dez indicadores está crítico.",
  ];
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** parágrafos já escapados viram o corpo HTML do e-mail */
function corpoHtml(paragrafos: string[]): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f">`,
    ...paragrafos.map((p, i) => `<p style="margin:0 0 ${i === paragrafos.length - 1 ? 0 : 14}px">${p}</p>`),
    `</div>`,
  ].join("\n");
}

/** nome do PDF: o anexo do e-mail e o "Baixar PDF" */
export function nomeDoArquivo(semana: Semana): string {
  return `Relatório Comercial Semanal ${diaMes(semana.inicio).replace("/", "-")} a ${dataBr(semana.fim).replace(/\//g, "-")}.pdf`;
}

const FECHO = ["O relatório completo vai em PDF, em anexo.", "As perguntas para a reunião de segunda estão no fim do PDF."];

export function montarEmailRelatorio(r: {
  semana: Semana;
  dados: DadosRelatorio;
  textos: TextosRelatorio | null;
  /** nome na abertura ("Estevam, o relatório…"); vazio abre sem nome */
  saudacao: string | null;
}): EmailRelatorio {
  const rot = rotuloSemanaCurto(r.semana);
  const nome = (r.saudacao ?? "").trim();
  const abertura = `${nome ? `${nome}, o` : "O"} relatório da semana de ${rot} está pronto.`;
  const resumo = linhasDoResumo(r.dados, r.textos);
  return {
    assunto: `Relatório Comercial Semanal Interlig – semana de ${rot}`,
    texto: [abertura, "", ...resumo, "", FECHO[0], "", FECHO[1]].join("\n"),
    html: corpoHtml([escapar(abertura), resumo.map(escapar).join("<br>"), ...FECHO.map(escapar)]),
    arquivo: nomeDoArquivo(r.semana),
  };
}

/**
 * Aviso para a caixa que envia quando a última tentativa da segunda falha:
 * ninguém recebeu nada, e o relatório sai pelo botão. (Este vai só para quem
 * tem login, por isso pode levar o link.)
 */
export function montarAvisoFalha(r: { semana: Semana; para: string[]; motivo: string; link: string }): EmailSimples {
  const rot = rotuloSemanaCurto(r.semana);
  const linhas = [
    `O envio automático do relatório da semana de ${rot} não saiu, e nada foi enviado para ${lista(r.para)}.`,
    `Motivo: ${r.motivo}`,
    `Para mandar, abra Relatório da diretoria na plataforma e use "Enviar por e-mail":`,
  ];
  return {
    assunto: `Relatório da diretoria não foi enviado – semana de ${rot}`,
    texto: [linhas[0], "", linhas[1], "", `${linhas[2]} ${r.link}`].join("\n"),
    html: corpoHtml([
      escapar(linhas[0]),
      escapar(linhas[1]),
      `${escapar(linhas[2])} <a href="${escapar(r.link)}" style="color:#0b57d0">${escapar(r.link)}</a>`,
    ]),
  };
}

const EMAIL_VALIDO = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;
export const MAX_DESTINATARIOS = 10;

/** destinatários digitados (vírgula, ponto e vírgula, espaço ou linha) */
export function lerDestinatarios(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = String(texto ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const validos: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    if (!EMAIL_VALIDO.test(p)) invalidos.push(p);
    else if (!validos.includes(p)) validos.push(p);
  }
  return { validos, invalidos };
}
