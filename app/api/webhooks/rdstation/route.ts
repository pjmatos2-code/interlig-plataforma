import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook de conversão do RD Station Marketing → lead do site vira ticket no CRM.
 *
 * O formulário "Contratar Online" das LPs (interlig.com/lp-plano-*) é do RD;
 * no RD, em Integrações → Webhooks, cadastra-se esta URL no evento de CONVERSÃO:
 *   POST https://interlig-plataforma.vercel.app/api/webhooks/rdstation?secret=...
 *
 * Aceita os dois formatos do RD (clássico {leads:[...]} e novo {event_type,
 * payload}) e também um POST simples {nome, telefone, email, plano} — o que
 * permite testar e, se um dia o form sair do RD, plugar direto.
 */

type LeadNormalizado = {
  nome: string;
  telefone: string | null;
  email: string | null;
  identificador: string | null; // qual formulário/LP converteu
};

function soDigitos(t: unknown): string | null {
  if (typeof t !== "string") return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d || null;
}

function extrairLeads(corpo: Record<string, unknown>): LeadNormalizado[] {
  const achados: LeadNormalizado[] = [];
  const empurrar = (o: Record<string, unknown>, ident?: unknown) => {
    const nome = String(o.name ?? o.nome ?? "").trim();
    const telefone =
      soDigitos(o.mobile_phone) ?? soDigitos(o.personal_phone) ??
      soDigitos(o.phone) ?? soDigitos(o.telefone) ?? soDigitos(o.celular);
    const email = String(o.email ?? "").trim() || null;
    if (!nome && !telefone && !email) return;
    achados.push({
      nome: nome || "Lead do site",
      telefone,
      email,
      identificador:
        (typeof ident === "string" && ident) ||
        String(
          (o.last_conversion as { content?: { identificador?: string } })?.content
            ?.identificador ??
            o.conversion_identifier ??
            o.identificador ??
            ""
        ).trim() ||
        null,
    });
  };

  // formato clássico: { leads: [...] }
  if (Array.isArray(corpo.leads)) {
    for (const l of corpo.leads as Record<string, unknown>[]) empurrar(l);
  }
  // formato novo: { event_type, payload: {...} } (payload pode ser objeto ou lista)
  const payload = corpo.payload as Record<string, unknown> | Record<string, unknown>[] | undefined;
  if (payload) {
    for (const p of Array.isArray(payload) ? payload : [payload])
      empurrar(p, (p as Record<string, unknown>).conversion_identifier);
  }
  // POST simples (teste/manual)
  if (achados.length === 0 && (corpo.nome || corpo.name || corpo.telefone || corpo.email)) {
    empurrar(corpo, corpo.plano ?? corpo.identificador);
  }
  return achados;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const admin = criarClienteAdmin();

  const { data: cfgRow } = await admin
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "rdstation")
    .maybeSingle();
  const segredo = (cfgRow?.config as { webhook_secret?: string } | null)?.webhook_secret;
  const informado =
    url.searchParams.get("secret") ?? request.headers.get("x-rd-secret");
  if (!segredo || informado !== segredo) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const leads = extrairLeads(corpo);
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
            texto: `Novo pré-cadastro no site${lead.identificador ? ` (${lead.identificador})` : ""}${lead.email ? ` · e-mail: ${lead.email}` : ""} — cliente demonstrou interesse de novo.`,
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
        texto: `Pré-cadastro pelo site (Contratar Online)${lead.identificador ? ` · formulário: ${lead.identificador}` : ""}${lead.email ? ` · e-mail: ${lead.email}` : ""}.`,
      },
    });
  }

  return NextResponse.json({ resultado: "ok", criados, jaExistiam }, { status: 201 });
}
