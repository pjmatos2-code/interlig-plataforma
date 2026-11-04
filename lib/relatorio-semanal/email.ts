import type { DadosRelatorio, TextosRelatorio } from "./tipos";
import { contagemStatus } from "./placar";
import { dataBr, diaMes, rotuloSemanaCurto, type Semana } from "./periodo";
import { lista, num, pct, plural, reaisMil } from "./formato";

/**
 * O e-mail do relatório (funções puras): assunto, corpo em texto e em HTML,
 * no formato do e-mail que o Paulo aprovou — abertura com o nome do CEO, as
 * cinco linhas do resumo (melhor e pior indicador, base, críticos, o que
 * decidir) e o fecho com o PDF em anexo e o link da plataforma.
 */

export type EmailRelatorio = { assunto: string; texto: string; html: string; arquivo: string };

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

export function montarEmailRelatorio(r: {
  semana: Semana;
  dados: DadosRelatorio;
  textos: TextosRelatorio | null;
  /** nome na abertura ("Estevam, o relatório…"); vazio abre sem nome */
  saudacao: string | null;
  /** o relatório na plataforma (precisa de login com perfil Direção ou gestor) */
  link: string;
  comPdf: boolean;
}): EmailRelatorio {
  const rot = rotuloSemanaCurto(r.semana);
  const nome = (r.saudacao ?? "").trim();
  const abertura = `${nome ? `${nome}, o` : "O"} relatório da semana de ${rot} está pronto.`;
  const resumo = linhasDoResumo(r.dados, r.textos);
  const fecho = r.comPdf
    ? ["O relatório completo vai em PDF, em anexo.", "Na reunião de segunda você preenche as respostas e copia o checklist para o Paulo no relatório da plataforma:"]
    : ["Relatório completo:"];
  const fechoFinal = r.comPdf ? null : "Na reunião de segunda você preenche as respostas e copia o checklist para o Paulo nesse mesmo link.";

  const texto = [
    abertura,
    "",
    ...resumo,
    "",
    ...(r.comPdf ? [fecho[0], "", `${fecho[1]} ${r.link}`] : [`${fecho[0]} ${r.link}`, "", fechoFinal!]),
  ].join("\n");

  const p = (conteudo: string, ultimo = false) => `<p style="margin:0 0 ${ultimo ? 0 : 14}px">${conteudo}</p>`;
  const link = `<a href="${escapar(r.link)}" style="color:#0b57d0">${escapar(r.link)}</a>`;
  const html = [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f1f1f">`,
    p(escapar(abertura)),
    p(resumo.map(escapar).join("<br>")),
    ...(r.comPdf
      ? [p(escapar(fecho[0])), p(`${escapar(fecho[1])} ${link}`, true)]
      : [p(`${escapar(fecho[0])} ${link}`), p(escapar(fechoFinal!), true)]),
    `</div>`,
  ].join("\n");

  return {
    assunto: `Relatório Comercial Semanal Interlig – semana de ${rot}`,
    texto,
    html,
    arquivo: `Relatório Comercial Semanal ${diaMes(r.semana.inicio).replace("/", "-")} a ${dataBr(r.semana.fim).replace(/\//g, "-")}.pdf`,
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
