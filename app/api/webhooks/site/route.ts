import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook do SITE (interlig.com) → pré-cadastro do "Contratar Online" vira
 * ticket no CRM. A plataforma substitui o RD Station: o formulário das LPs
 * passa a ser o widget de Formulário do Elementor Pro, com a ação pós-envio
 * "Webhook" apontando para:
 *   POST https://interlig-plataforma.vercel.app/api/webhooks/site?secret=...
 *
 * O Elementor envia os campos como form-data (multipart/urlencoded), com as
 * chaves = ID de cada campo. IDs esperados no formulário: nome, telefone (ou
 * celular), email, plano. Também aceita JSON simples {nome, telefone, email,
 * plano} — e, por compatibilidade, os formatos do RD ({leads:[...]}/{payload}).
 */

type LeadNormalizado = {
  nome: string;
  telefone: string | null;
  email: string | null;
  /** plano de interesse / identificador do formulário que converteu */
  interesse: string | null;
};

function soDigitos(t: unknown): string | null {
  if (typeof t !== "string") return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d || null;
}

/** normaliza chaves do Elementor: "form_fields[nome]" → "nome" */
function achatarChaves(o: Record<string, unknown>): Record<string, unknown> {
  const plano: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const m = k.match(/^form_fields\[([^\]]+)\]$/);
    plano[(m?.[1] ?? k).toLowerCase()] = v;
  }
  return plano;
}

function extrairLeads(bruto: Record<string, unknown>): LeadNormalizado[] {
  const achados: LeadNormalizado[] = [];
  const empurrar = (obj: Record<string, unknown>, ident?: unknown) => {
    const o = achatarChaves(obj);
    const nome = String(o.name ?? o.nome ?? "").trim();
    const telefone =
      soDigitos(o.mobile_phone) ?? soDigitos(o.personal_phone) ??
      soDigitos(o.phone) ?? soDigitos(o.telefone) ?? soDigitos(o.celular) ??
      soDigitos(o.whatsapp);
    const email = String(o.email ?? "").trim() || null;
    if (!nome && !telefone && !email) return;
    achados.push({
      nome: nome || "Lead do site",
      telefone,
      email,
      interesse:
        String(o.plano ?? o.plan ?? "").trim() ||
        (typeof ident === "string" && ident) ||
        String(
          (o.last_conversion as { content?: { identificador?: string } })?.content
            ?.identificador ?? o.conversion_identifier ?? o.identificador ?? ""
        ).trim() ||
        null,
    });
  };

  if (Array.isArray(bruto.leads)) {
    for (const l of bruto.leads as Record<string, unknown>[]) empurrar(l);
  }
  const payload = bruto.payload as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (payload) {
    for (const p of Array.isArray(payload) ? payload : [payload])
      empurrar(p, (p as Record<string, unknown>).conversion_identifier);
  }
  if (achados.length === 0) empurrar(bruto);
  return achados;
}

async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) {
    return ((await request.json().catch(() => ({}))) as Record<string, unknown>) ?? {};
  }
  // Elementor: multipart/form-data ou x-www-form-urlencoded
  try {
    const fd = await request.formData();
    const o: Record<string, unknown> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
    return o;
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const admin = criarClienteAdmin();

  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "site")
    .maybeSingle();
  const segredo = (cfgRow?.config as { webhook_secret?: string } | null)?.webhook_secret;
  const informado =
    url.searchParams.get("secret") ?? request.headers.get("x-site-secret");
  if (!segredo || informado !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const leads = extrairLeads(await lerCorpo(request));
  if (leads.length === 0) {
    return NextResponse.json({ resultado: "sem lead no corpo" }, { status: 200 });
  }

  let criados = 0;
  let jaExistiam = 0;
  for (const lead of leads) {
    // anti-duplicidade: ticket aberto com o mesmo telefone
    if (lead.telefone) {
      const { data: abertos } = await admin
        .from("tickets")
        .select("id, telefone")
        .neq("etapa", "fechado")
        .not("telefone", "is", null)
        .limit(2000);
      const existente = (abertos ?? []).find((t) => soDigitos(t.telefone) === lead.telefone);
      if (existente) {
        jaExistiam += 1;
        await admin.from("ticket_eventos").insert({
          ticket_id: existente.id,
          tipo: "nota",
          dados: {
            texto: `Novo pré-cadastro no site${lead.interesse ? ` · interesse: ${lead.interesse}` : ""}${lead.email ? ` · e-mail: ${lead.email}` : ""} — cliente demonstrou interesse de novo.`,
          },
        });
        continue;
      }
    }

    const { data: novo, error } = await admin
      .from("tickets")
      .insert({
        origem_criacao: "site",
        cliente_nome: lead.nome,
        telefone: lead.telefone,
        etapa: "novo",
      })
      .select("id")
      .single();
    if (error || !novo) continue;
    criados += 1;
    await admin.from("ticket_eventos").insert({
      ticket_id: novo.id,
      tipo: "nota",
      dados: {
        texto: `Pré-cadastro pelo site (Contratar Online)${lead.interesse ? ` · plano de interesse: ${lead.interesse}` : ""}${lead.email ? ` · e-mail: ${lead.email}` : ""}.`,
      },
    });
  }

  return NextResponse.json({ resultado: "ok", criados, jaExistiam }, { status: 201 });
}
