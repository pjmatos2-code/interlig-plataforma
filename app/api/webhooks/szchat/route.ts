import { NextResponse } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerConfigSzchat } from "@/lib/integracoes/config";
import { normalizarTelefone } from "@/lib/indicadores/crm";

export const dynamic = "force-dynamic";

/**
 * Webhook do SZ Chat (PRD 7.1 + docs/decisoes.md D1).
 * O webhook NATIVO do SZ (Integrações → API) não permite cabeçalho
 * customizado, então o segredo pode vir por header OU query (?secret=), e o
 * corpo por JSON OU form-urlencoded. TODA chamada é registrada em
 * szchat_eventos_brutos para descoberta/auditoria; o mapeamento de campos é
 * flexível (nomes variam conforme o evento do SZ).
 */

/** Extrai o primeiro campo presente entre vários nomes possíveis. */
function pegar(obj: Record<string, unknown>, ...chaves: string[]): string | null {
  for (const c of chaves) {
    // busca case-insensitive e em caminhos aninhados (a.b)
    const partes = c.split(".");
    let atual: unknown = obj;
    for (const p of partes) {
      if (atual && typeof atual === "object") {
        const encontrada = Object.keys(atual as object).find(
          (k) => k.toLowerCase() === p.toLowerCase()
        );
        atual = encontrada ? (atual as Record<string, unknown>)[encontrada] : undefined;
      } else {
        atual = undefined;
      }
    }
    if (atual !== undefined && atual !== null && String(atual).trim() !== "") {
      return String(atual).trim();
    }
  }
  return null;
}

export async function POST(request: Request) {
  const admin = criarClienteAdmin();
  const url = new URL(request.url);

  // ---------- corpo: JSON ou form-urlencoded ----------
  const contentType = request.headers.get("content-type") ?? "";
  let corpo: Record<string, unknown> = {};
  let corpoTexto = "";
  try {
    corpoTexto = await request.text();
    if (contentType.includes("application/json")) {
      corpo = JSON.parse(corpoTexto || "{}");
    } else {
      // form-urlencoded (ou querystring): vira objeto plano
      const params = new URLSearchParams(corpoTexto);
      corpo = Object.fromEntries(params.entries());
      // se algum valor for JSON aninhado, tenta desdobrar
      for (const [k, v] of Object.entries(corpo)) {
        if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
          try {
            corpo[k] = JSON.parse(v);
          } catch {
            /* mantém string */
          }
        }
      }
    }
  } catch {
    corpo = { _texto_bruto: corpoTexto.slice(0, 2000) };
  }

  // ---------- registro bruto (sempre) ----------
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    // não guarda o segredo em claro
    headers[k] = k.toLowerCase().includes("secret") ? "***" : v;
  });
  async function registrar(resultado: string, ticketId?: string) {
    await admin.from("szchat_eventos_brutos").insert({
      metodo: "POST",
      content_type: contentType,
      headers,
      corpo,
      resultado,
      ticket_id: ticketId ?? null,
    });
  }

  // ---------- segredo: header ou query (?secret=) ----------
  const segredo = (await lerConfigSzchat()).webhook_secret;
  const enviado =
    request.headers.get("x-szchat-secret") ??
    url.searchParams.get("secret") ??
    (typeof corpo._secret === "string" ? corpo._secret : null);
  if (!segredo) {
    await registrar("erro: segredo não configurado no servidor");
    return NextResponse.json({ erro: "SZCHAT_WEBHOOK_SECRET não configurado" }, { status: 503 });
  }
  if (enviado !== segredo) {
    await registrar("recusado: segredo inválido");
    return NextResponse.json({ erro: "segredo inválido" }, { status: 401 });
  }

  // ---------- mapeamento flexível dos campos ----------
  const eventoId =
    pegar(corpo, "evento_id", "event_id", "id", "protocolo", "protocol", "conversa_id", "conversation_id") ??
    `sz-${Date.now()}`;
  const nome = pegar(corpo, "contato.nome", "contact.name", "cliente_nome", "cliente", "nome", "name", "contato_nome");
  const telefone = pegar(
    corpo,
    "contato.telefone", "contact.phone", "telefone", "phone", "numero", "number", "whatsapp", "contato_telefone", "contato_numero"
  );
  const equipe = pegar(
    corpo,
    "equipe", "team", "fila", "queue", "departamento", "department", "setor", "sector", "grupo", "group"
  );
  const conversaId = pegar(corpo, "conversa_id", "conversation_id", "protocolo", "protocol", "chat_id");
  const atendenteId = pegar(corpo, "atendente.id", "agent.id", "atendente_id", "agent_id", "usuario_id", "user_id");

  // ---------- idempotência ----------
  const { data: jaProcessado } = await admin
    .from("ticket_eventos")
    .select("ticket_id")
    .eq("tipo", "webhook_sz")
    .eq("dados->>sz_evento_id", eventoId)
    .maybeSingle();
  if (jaProcessado) {
    await registrar("ja_processado", jaProcessado.ticket_id);
    return NextResponse.json({ resultado: "ja_processado", ticket_id: jaProcessado.ticket_id });
  }

  // sem nome de cliente não dá para criar ticket — mas capturamos para análise
  if (!nome) {
    await registrar("sem_nome: payload capturado para descoberta");
    return NextResponse.json({
      resultado: "capturado",
      aviso: "sem nome de contato reconhecido — payload registrado para mapeamento",
    });
  }

  // ---------- D1: equipe habilitada? ----------
  if (!equipe) {
    await registrar("sem_equipe: payload capturado");
    return NextResponse.json({ resultado: "capturado", aviso: "sem equipe reconhecida no payload" });
  }
  const { data: equipeHab } = await admin
    .from("sz_equipes_habilitadas")
    .select("id, pop_id, ativo")
    .ilike("nome", equipe)
    .maybeSingle();
  if (!equipeHab || !equipeHab.ativo) {
    await registrar(`ignorado: equipe "${equipe}" não habilitada`);
    return NextResponse.json({
      resultado: "ignorado",
      motivo: `equipe "${equipe}" não habilitada para gerar ticket (docs/decisoes.md D1)`,
    });
  }

  // ---------- atendente → vendedora ----------
  let vendedorId: string | null = null;
  let popId: string | null = equipeHab.pop_id;
  if (atendenteId) {
    const { data: mapa } = await admin
      .from("sz_atendentes_map")
      .select("vendedor_id, vendedores(pop_id)")
      .eq("sz_atendente_id", atendenteId)
      .maybeSingle();
    if (mapa) {
      vendedorId = mapa.vendedor_id;
      popId = (mapa.vendedores as unknown as { pop_id: string | null } | null)?.pop_id ?? popId;
    }
  }

  // ---------- anti-duplicidade ----------
  let ticketExistente: string | null = null;
  if (conversaId) {
    const { data } = await admin
      .from("tickets")
      .select("id")
      .eq("sz_conversa_id", conversaId)
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
    ticketExistente = (abertos ?? []).find((t) => normalizarTelefone(t.telefone) === alvo)?.id ?? null;
  }
  if (ticketExistente) {
    await admin.from("ticket_eventos").insert({
      ticket_id: ticketExistente,
      tipo: "webhook_sz",
      dados: { sz_evento_id: eventoId, anexado: true, payload: corpo },
    });
    await admin.from("tickets").update({ atualizado_em: new Date().toISOString() }).eq("id", ticketExistente);
    await registrar("anexado", ticketExistente);
    return NextResponse.json({ resultado: "anexado", ticket_id: ticketExistente });
  }

  // ---------- cria o ticket ----------
  const { data: novo, error } = await admin
    .from("tickets")
    .insert({
      origem_criacao: "sz_auto",
      sz_conversa_id: conversaId,
      cliente_nome: nome,
      telefone,
      vendedor_id: vendedorId,
      pop_id: popId,
      etapa: "novo",
    })
    .select("id")
    .single();
  if (error) {
    await registrar(`erro ao criar: ${error.message}`);
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  await admin.from("ticket_eventos").insert({
    ticket_id: novo.id,
    tipo: "webhook_sz",
    dados: { sz_evento_id: eventoId, payload: corpo },
  });
  await registrar("criado", novo.id);
  return NextResponse.json({ resultado: "criado", ticket_id: novo.id }, { status: 201 });
}

// alguns webhooks testam a URL com GET — respondemos vivo
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook szchat" });
}
