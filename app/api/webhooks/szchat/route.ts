import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { normalizarTelefone } from "@/lib/indicadores/crm";

export const dynamic = "force-dynamic";

/**
 * Webhook do SZ Chat (PRD 7.1 + docs/decisoes.md D1).
 * - valida segredo compartilhado (SZCHAT_WEBHOOK_SECRET, header x-szchat-secret)
 * - IDEMPOTENTE: o mesmo evento_id nunca cria dois tickets (índice único em
 *   ticket_eventos + verificação prévia)
 * - D1: só conversas direcionadas a uma Equipe comercial HABILITADA geram
 *   ticket; as demais retornam "ignorado" (sem efeito)
 * - anti-duplicidade: conversa/telefone com ticket aberto → anexa ao existente
 * Teste: docs/szchat-samples/LEIA-ME.md
 */

type PayloadSz = {
  evento_id?: string;
  tipo?: string;
  equipe?: string;
  conversa_id?: string;
  contato?: { nome?: string; telefone?: string };
  atendente?: { id?: string; nome?: string };
  timestamp?: string;
};

export async function POST(request: Request) {
  // ---------- segredo ----------
  const segredo = process.env.SZCHAT_WEBHOOK_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { erro: "SZCHAT_WEBHOOK_SECRET não configurado no servidor" },
      { status: 503 }
    );
  }
  if (request.headers.get("x-szchat-secret") !== segredo) {
    return NextResponse.json({ erro: "segredo inválido" }, { status: 401 });
  }

  let payload: PayloadSz;
  try {
    payload = (await request.json()) as PayloadSz;
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 });
  }

  const eventoId = payload.evento_id;
  const nome = payload.contato?.nome?.trim();
  const telefone = payload.contato?.telefone?.trim() || null;
  if (!eventoId || !nome) {
    return NextResponse.json(
      { erro: "payload precisa de evento_id e contato.nome" },
      { status: 422 }
    );
  }

  const admin = criarClienteAdmin();

  // ---------- idempotência ----------
  const { data: jaProcessado } = await admin
    .from("ticket_eventos")
    .select("ticket_id")
    .eq("tipo", "webhook_sz")
    .eq("dados->>sz_evento_id", eventoId)
    .maybeSingle();
  if (jaProcessado) {
    return NextResponse.json({
      resultado: "ja_processado",
      ticket_id: jaProcessado.ticket_id,
    });
  }

  // ---------- D1: a equipe está habilitada? ----------
  const { data: equipe } = await admin
    .from("sz_equipes_habilitadas")
    .select("id, pop_id, ativo")
    .eq("nome", payload.equipe ?? "")
    .maybeSingle();
  if (!equipe || !equipe.ativo) {
    return NextResponse.json({
      resultado: "ignorado",
      motivo: `equipe "${payload.equipe ?? "?"}" não habilitada para gerar ticket (docs/decisoes.md D1)`,
    });
  }

  // ---------- atendente → vendedora (sz_atendentes_map) ----------
  let vendedorId: string | null = null;
  let popId: string | null = equipe.pop_id;
  if (payload.atendente?.id) {
    const { data: mapa } = await admin
      .from("sz_atendentes_map")
      .select("vendedor_id, vendedores(pop_id)")
      .eq("sz_atendente_id", payload.atendente.id)
      .maybeSingle();
    if (mapa) {
      vendedorId = mapa.vendedor_id;
      const rel = mapa.vendedores as unknown as { pop_id: string | null } | null;
      popId = rel?.pop_id ?? popId;
    }
  }

  // ---------- anti-duplicidade: conversa ou telefone com ticket aberto ----------
  let ticketExistente: string | null = null;
  if (payload.conversa_id) {
    const { data } = await admin
      .from("tickets")
      .select("id")
      .eq("sz_conversa_id", payload.conversa_id)
      .neq("etapa", "fechado")
      .maybeSingle();
    ticketExistente = data?.id ?? null;
  }
  if (!ticketExistente && telefone) {
    const alvo = normalizarTelefone(telefone);
    const { data: abertos } = await admin
      .from("tickets")
      .select("id, telefone")
      .neq("etapa", "fechado")
      .limit(500);
    ticketExistente =
      (abertos ?? []).find((t) => normalizarTelefone(t.telefone) === alvo)?.id ?? null;
  }

  if (ticketExistente) {
    // nova conversa anexada ao ticket aberto existente (PRD 3.9)
    await admin.from("ticket_eventos").insert({
      ticket_id: ticketExistente,
      tipo: "webhook_sz",
      dados: { sz_evento_id: eventoId, anexado: true, payload },
    });
    await admin
      .from("tickets")
      .update({ atualizado_em: new Date().toISOString() })
      .eq("id", ticketExistente);
    return NextResponse.json({ resultado: "anexado", ticket_id: ticketExistente });
  }

  // ---------- cria o ticket ----------
  const { data: novo, error } = await admin
    .from("tickets")
    .insert({
      origem_criacao: "sz_auto",
      sz_conversa_id: payload.conversa_id ?? null,
      cliente_nome: nome,
      telefone,
      vendedor_id: vendedorId, // null = "não atribuído": supervisor distribui
      pop_id: popId,
      etapa: "novo",
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  // payload bruto na trilha, com o evento_id da idempotência (PRD 7.1)
  await admin.from("ticket_eventos").insert({
    ticket_id: novo.id,
    tipo: "webhook_sz",
    dados: { sz_evento_id: eventoId, payload },
  });

  return NextResponse.json({ resultado: "criado", ticket_id: novo.id }, { status: 201 });
}
