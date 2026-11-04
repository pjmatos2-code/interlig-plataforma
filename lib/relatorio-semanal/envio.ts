import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { enviarEmail, explicarErroSmtp, lerConfigEmail } from "@/lib/email/enviar";
import { lerConfigEnvio } from "./config";
import { montarEmailRelatorio } from "./email";
import { gerarPdfRelatorio } from "./pdf";
import { gerarRelatorio } from "./gerar";
import { hojeSantarem, ultimaSemanaCompleta, type Semana } from "./periodo";
import type { DadosRelatorio, TextosRelatorio } from "./tipos";

/**
 * Envio do relatório por e-mail: gera o PDF, monta o e-mail no formato
 * aprovado e manda pela caixa cadastrada. Cada tentativa fica registrada em
 * relatorios_envios.
 *
 * Pelo botão, sem PDF não sai nada (quem clicou vê o erro). No automático
 * de segunda, se o PDF falhar, o e-mail sai mesmo assim com o resumo e o
 * link, e o aviso fica registrado — o CEO não fica sem o relatório.
 */

export type ResultadoEnvioRelatorio = { ok: true; comPdf: boolean; aviso: string | null } | { ok: false; erro: string };

type Registro = {
  relatorio_id: string;
  para: string[];
  assunto: string;
  enviado: boolean;
  com_pdf: boolean;
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
  const semana: Semana = { inicio: data.semana_inicio as string, fim: data.semana_fim as string };
  const base = { relatorio_id: id, para: o.para, automatico: o.automatico, enviado_por: o.usuarioId };

  let pdf: Buffer | null = null;
  let erroPdf: string | null = null;
  try {
    pdf = await gerarPdfRelatorio(id, o.origem);
  } catch (e) {
    erroPdf = msgErro(e);
    console.error("relatório semanal: PDF falhou:", erroPdf);
  }

  const email = montarEmailRelatorio({
    semana,
    dados: data.dados as DadosRelatorio,
    textos: (data.textos as TextosRelatorio | null) ?? null,
    saudacao: cfg.saudacao,
    link: `${o.origem}/relatorios/semanal/${id}`,
    comPdf: Boolean(pdf),
  });

  if (!pdf && !o.automatico) {
    await registrar({ ...base, assunto: email.assunto, enviado: false, com_pdf: false, erro: `PDF não gerado: ${erroPdf}` });
    return { ok: false, erro: `Não foi possível gerar o PDF, e o e-mail não foi enviado: ${erroPdf}` };
  }

  try {
    const r = await enviarEmail(
      {
        para: o.para,
        assunto: email.assunto,
        texto: email.texto,
        html: email.html,
        anexos: pdf ? [{ nome: email.arquivo, conteudo: pdf, tipo: "application/pdf" }] : [],
      },
      cfgEmail
    );
    const aviso = [erroPdf ? `saiu sem o PDF (${erroPdf})` : null, r.recusados.length ? `recusados pelo servidor: ${r.recusados.join(", ")}` : null]
      .filter(Boolean)
      .join("; ") || null;
    await registrar({ ...base, assunto: email.assunto, enviado: true, com_pdf: Boolean(pdf), erro: aviso, message_id: r.messageId });
    return { ok: true, comPdf: Boolean(pdf), aviso };
  } catch (e) {
    const erro = explicarErroSmtp(e);
    await registrar({ ...base, assunto: email.assunto, enviado: false, com_pdf: Boolean(pdf), erro });
    return { ok: false, erro };
  }
}

/**
 * Rotina de segunda (cron às 8h de Santarém): gera o relatório da semana
 * que acabou no domingo e manda para os destinatários salvos — só com o
 * automático ligado, e uma vez por semana (o cron pode repetir).
 */
export async function rotinaDeSegunda(origem: string, agora = new Date()): Promise<Record<string, unknown>> {
  const cfg = await lerConfigEnvio();
  if (!cfg.automatico) return { resultado: "envio automático desligado" };
  if (!cfg.para.length) return { resultado: "envio automático ligado, mas sem destinatários" };
  const semana = ultimaSemanaCompleta(hojeSantarem(agora));
  const admin = criarClienteAdmin();
  const { data: existente } = await admin.from("relatorios_semanais").select("id").eq("semana_inicio", semana.inicio).maybeSingle();
  if (existente) {
    const { data: envios } = await admin
      .from("relatorios_envios")
      .select("id")
      .eq("relatorio_id", existente.id)
      .eq("automatico", true)
      .eq("enviado", true)
      .limit(1);
    if (envios?.length) return { resultado: "esta semana já foi enviada", semana };
  }
  const gerado = await gerarRelatorio(semana, null);
  const envio = await enviarRelatorio(gerado.id, { para: cfg.para, usuarioId: null, automatico: true, origem });
  return { semana, id: gerado.id, erroTextos: gerado.erroTextos, envio };
}
