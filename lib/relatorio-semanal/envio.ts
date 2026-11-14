import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail, explicarErroSmtp, lerConfigEmail } from "@/lib/email/enviar";
import { lerConfigEnvio } from "./config";
import { montarAvisoFalha, montarEmailRelatorio } from "./email";
import { gerarPdfRelatorio } from "./pdf";
import { gerarRelatorio } from "./gerar";
import { horaSantarem, hojeSantarem, ultimaSemanaCompleta, type Semana } from "./periodo";
import type { DadosRelatorio, TextosRelatorio } from "./tipos";

/**
 * Envio do relatório por e-mail: gera o PDF, monta o e-mail no formato
 * aprovado e manda pela caixa cadastrada. Cada tentativa fica registrada em
 * relatorios_envios.
 *
 * O PDF é o relatório: o e-mail não leva link para a plataforma (decisão do
 * Paulo, 04/11/2026), então sem o PDF não sai nada. Pelo botão, quem clicou
 * vê o erro; na segunda, o cron tenta de novo às 9h e, se falhar outra vez,
 * avisa a caixa que envia.
 */

export type ResultadoEnvioRelatorio = { ok: true; aviso: string | null } | { ok: false; erro: string };

type Registro = {
  relatorio_id: string;
  para: string[];
  assunto: string;
  enviado: boolean;
  automatico: boolean;
  enviado_por: string | null;
  erro: string | null;
  message_id?: string | null;
};

async function registrar(r: Registro) {
  const { error } = await criarClienteAdmin().from("relatorios_envios").insert(r);
  if (error) console.error("relatorios_envios: não gravou o registro do envio:", error.message);
}

const msgErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function enviarRelatorio(
  id: string,
  o: { para: string[]; usuarioId: string | null; automatico: boolean; origem: string }
): Promise<ResultadoEnvioRelatorio> {
  if (!o.para.length) return { ok: false, erro: "Informe ao menos um destinatário." };
  const admin = criarClienteAdmin();
  const { data } = await admin.from("relatorios_semanais").select("id, semana_inicio, semana_fim, dados, textos").eq("id", id).maybeSingle();
  if (!data) return { ok: false, erro: "Relatório não encontrado." };
  const cfgEmail = await lerConfigEmail();
  if (!cfgEmail.usuario || !cfgEmail.senha) {
    return { ok: false, erro: "O e-mail de envio não está configurado. Cadastre a caixa em Administração → Integrações." };
  }
  const cfg = await lerConfigEnvio();
  const email = montarEmailRelatorio({
    semana: { inicio: data.semana_inicio as string, fim: data.semana_fim as string },
    dados: data.dados as DadosRelatorio,
    textos: (data.textos as TextosRelatorio | null) ?? null,
    saudacao: cfg.saudacao,
  });
  const base = { relatorio_id: id, para: o.para, assunto: email.assunto, automatico: o.automatico, enviado_por: o.usuarioId };

  let pdf: Buffer;
  try {
    pdf = await gerarPdfRelatorio(id, o.origem);
  } catch (e) {
    const erroPdf = msgErro(e);
    console.error("relatório semanal: PDF falhou:", erroPdf);
    await registrar({ ...base, enviado: false, erro: `PDF não gerado: ${erroPdf}` });
    return { ok: false, erro: `Não foi possível gerar o PDF, e o e-mail não foi enviado: ${erroPdf}` };
  }

  try {
    const r = await enviarEmail(
      {
        para: o.para,
        assunto: email.assunto,
        texto: email.texto,
        html: email.html,
        anexos: [{ nome: email.arquivo, conteudo: pdf, tipo: "application/pdf" }],
      },
      cfgEmail
    );
    const aviso = r.recusados.length ? `recusados pelo servidor: ${r.recusados.join(", ")}` : null;
    await registrar({ ...base, enviado: true, erro: aviso, message_id: r.messageId });
    return { ok: true, aviso };
  } catch (e) {
    const erro = explicarErroSmtp(e);
    await registrar({ ...base, enviado: false, erro });
    return { ok: false, erro };
  }
}

/** o cron de segunda roda às 8h e às 9h de Santarém (vercel.json); a das 9h é a última */
const HORA_ULTIMA_TENTATIVA = 9;

/**
 * Rotina de segunda: gera o relatório da semana que acabou no domingo e
 * manda para os destinatários salvos — só com o automático ligado, e só para
 * quem ainda não recebeu o desta semana (pelo botão ou pela rotina).
 *
 * Às 8h, se os textos do Claude falharem, não manda: a tentativa das 9h gera
 * de novo. Às 9h manda o que tiver e, se não sair, avisa a caixa que envia.
 * Relatório gerado hoje e com os textos (pelas 8h ou pelo botão) é mandado
 * como está, sem gerar de novo.
 */
export async function rotinaDeSegunda(origem: string, agora = new Date()): Promise<Record<string, unknown>> {
  const cfg = await lerConfigEnvio();
  if (!cfg.automatico) return { resultado: "envio automático desligado" };
  if (!cfg.para.length) return { resultado: "envio automático ligado, mas sem destinatários" };
  const hoje = hojeSantarem(agora);
  const semana = ultimaSemanaCompleta(hoje);
  const ultimaTentativa = horaSantarem(agora) >= HORA_ULTIMA_TENTATIVA;
  const admin = criarClienteAdmin();
  const { data: existente } = await admin
    .from("relatorios_semanais")
    .select("id, gerado_em, textos, textos_erro")
    .eq("semana_inicio", semana.inicio)
    .maybeSingle();

  let para = cfg.para;
  if (existente) {
    const { data: envios } = await admin.from("relatorios_envios").select("para").eq("relatorio_id", existente.id).eq("enviado", true);
    const jaRecebeu = new Set((envios ?? []).flatMap((e) => ((e.para as string[] | null) ?? []).map((p) => p.toLowerCase())));
    para = cfg.para.filter((p) => !jaRecebeu.has(p.toLowerCase()));
    if (!para.length) return { resultado: "esta semana já foi enviada", semana };
  }

  const reaproveitado = Boolean(
    existente?.textos && !existente.textos_erro && hojeSantarem(new Date(existente.gerado_em as string)) === hoje
  );
  let id = existente?.id as string | undefined;
  let erroTextos: string | null = null;
  if (!reaproveitado) {
    try {
      const g = await gerarRelatorio(semana, null);
      id = g.id;
      erroTextos = g.erroTextos;
    } catch (e) {
      const erro = `Não foi possível gerar o relatório: ${msgErro(e)}`;
      if (ultimaTentativa) await avisarFalha(semana, para, erro, origem);
      return { semana, envio: { ok: false, erro }, ultimaTentativa };
    }
    if (erroTextos && !ultimaTentativa) {
      return { semana, id, erroTextos, resultado: "os textos falharam; a tentativa das 9h gera de novo e manda" };
    }
  }
  const envio = await enviarRelatorio(id as string, { para, usuarioId: null, automatico: true, origem });
  if (!envio.ok && ultimaTentativa) await avisarFalha(semana, para, envio.erro, origem);
  return { semana, id, para, reaproveitado, erroTextos, envio, ultimaTentativa };
}

/** a última tentativa de segunda falhou: avisa só a caixa que envia */
async function avisarFalha(semana: Semana, para: string[], motivo: string, origem: string) {
  try {
    const cfgEmail = await lerConfigEmail();
    if (!cfgEmail.usuario || !cfgEmail.senha) return;
    await enviarEmail({ para: [cfgEmail.usuario], ...montarAvisoFalha({ semana, para, motivo, link: `${origem}/relatorios` }) }, cfgEmail);
  } catch (e) {
    console.error("relatório da diretoria: o aviso de falha não saiu:", msgErro(e));
  }
}
