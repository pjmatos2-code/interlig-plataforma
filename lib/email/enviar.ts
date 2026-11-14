import "server-only";
import { createTransport } from "nodemailer";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Envio de e-mail pela caixa corporativa cadastrada em Administração →
 * Integrações (integracoes_config, sistema 'email'). O interlig.com fica na
 * Locaweb (MX mx.core.locaweb.com.br): SMTP email-ssl.com.br, porta 465 com
 * SSL, usuário = o endereço completo, senha = a senha da caixa.
 *
 * Mandado por SMTP, o e-mail não aparece na pasta Enviados da caixa — por
 * isso o remetente vai sempre em cópia oculta, para guardar o que saiu.
 */

export const SMTP_PADRAO = { host: "email-ssl.com.br", porta: 465 } as const;

export type ConfigEmail = {
  usuario: string | null;
  senha: string | null;
  nome: string | null;
  host: string;
  porta: number;
};

export async function lerConfigEmail(): Promise<ConfigEmail> {
  const { data } = await criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "email").maybeSingle();
  const c = (data?.config ?? {}) as Record<string, unknown>;
  const porta = Number(c.porta);
  return {
    usuario: typeof c.usuario === "string" && c.usuario ? c.usuario : null,
    senha: typeof c.senha === "string" && c.senha ? c.senha : null,
    nome: typeof c.nome === "string" && c.nome ? c.nome : null,
    host: typeof c.host === "string" && c.host ? c.host : SMTP_PADRAO.host,
    porta: Number.isInteger(porta) && porta > 0 ? porta : SMTP_PADRAO.porta,
  };
}

export type Anexo = { nome: string; conteudo: Buffer; tipo: string };

export type EmailParaEnviar = {
  para: string[];
  assunto: string;
  texto: string;
  html: string;
  anexos?: Anexo[];
};

export type ResultadoEnvio = { messageId: string | null; recusados: string[] };

/** traduz os erros mais comuns do SMTP para quem está na tela */
export function explicarErroSmtp(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const msg = err?.message ?? String(e);
  if (err?.code === "EAUTH" || err?.responseCode === 535) return "O servidor recusou o usuário ou a senha do e-mail. Confira a senha da caixa em Administração → Integrações.";
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET") return `Não foi possível conectar ao servidor de e-mail (${msg}). Confira o servidor e a porta.`;
  if (err?.code === "EENVELOPE") return `Destinatário recusado pelo servidor: ${msg}`;
  if (err?.code === "EMESSAGE" || err?.responseCode === 552) return `O servidor recusou a mensagem (tamanho ou conteúdo): ${msg}`;
  return msg;
}

export async function enviarEmail(email: EmailParaEnviar, cfg?: ConfigEmail): Promise<ResultadoEnvio> {
  const c = cfg ?? (await lerConfigEmail());
  if (!c.usuario || !c.senha) throw new Error("O e-mail de envio não está configurado. Cadastre a caixa em Administração → Integrações.");
  const transporte = createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    requireTLS: c.porta !== 465,
    auth: { user: c.usuario, pass: c.senha },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
  try {
    const info = await transporte.sendMail({
      from: { name: c.nome || "Interlig · Inteligência Comercial", address: c.usuario },
      to: email.para,
      bcc: email.para.some((p) => p.toLowerCase() === c.usuario!.toLowerCase()) ? undefined : c.usuario,
      subject: email.assunto,
      text: email.texto,
      html: email.html,
      attachments: (email.anexos ?? []).map((a) => ({ filename: a.nome, content: a.conteudo, contentType: a.tipo })),
    });
    return {
      messageId: info.messageId ?? null,
      recusados: ((info.rejected ?? []) as unknown[]).map((r) => (typeof r === "string" ? r : ((r as { address?: string })?.address ?? String(r)))),
    };
  } finally {
    transporte.close();
  }
}
