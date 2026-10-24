/**
 * Adaptador SZ Chat (Fortics) → modelo interno — parte PURA (24/10/2026).
 *
 * Formato observado no relatório /reports/messages (sondagem de 24/10):
 *  - conversa: _id, protocol, campaign_id (equipe), channel.description,
 *    agent.name, agent_id, contact.name/number, platform_id, typeStatus
 *    (success/loss), finished_at {date, timezone: America/Santarem},
 *    events [{event, created_at, status}]
 *  - mensagem (getTalks): message_id, origin (channel = cliente, agent =
 *    humano, auto = automação, system = sistema), user.name (agente), type,
 *    created_at "aaaa-mm-dd hh:mm:ss.ffffff" no horário de Santarém,
 *    wbs_session_category (ui_* iniciada pelo cliente, bi_* pela empresa)
 * Testado em sz-normalizar.test.ts com amostras reais anonimizadas.
 */
import type { AutorMensagem, ConversaNormalizada, EventoCiclo, EventoInterno, MensagemNormalizada } from "./modelo";

/** "2026-10-21 07:36:28.631665" (Santarém) → ISO com -03:00 (milissegundos) */
export function szDataParaIso(bruto: unknown): string | null {
  const s = typeof bruto === "string" ? bruto : (bruto as { date?: string } | null)?.date;
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?/);
  if (!m) return null;
  const frac = (m[3] ?? ".000").slice(0, 4).padEnd(4, "0");
  const iso = `${m[1]}T${m[2]}${frac}-03:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

const MAPA_EVENTOS: Record<string, EventoInterno> = {
  autoStartFlow: "fluxo_inicio",
  waitStart: "espera_inicio",
  humanStart: "humano_inicio",
  humanFinish: "humano_fim",
  humanFinishTime: "fim_por_tempo",
  humanTransfer: "transferencia",
  humanTransferAgent: "transferencia",
  agentRequestTransfer: "transferencia_pedido",
  agentResponseTransfer: "transferencia_pedido",
};

export function autorSz(m: Record<string, unknown>): AutorMensagem {
  const origem = String(m.origin ?? "");
  if (origem === "channel") return "cliente";
  if (origem === "agent" || (m.user && (m.user as { name?: string }).name)) return "agente";
  if (origem === "system") return "sistema";
  return "automacao"; // auto, bot, ia, flow…: nunca conta como esforço humano
}

function textoSz(m: Record<string, unknown>): string {
  const raw = m.message;
  const t =
    typeof raw === "string"
      ? raw
      : ((raw as { text?: string; caption?: string } | null)?.text ?? (raw as { caption?: string } | null)?.caption ?? "");
  return String(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** telefone BR (10–11 dígitos, sem 55); LID do WhatsApp vira null */
export function telefoneBrSz(bruto: unknown): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

export function normalizarMensagensSz(brutas: unknown): MensagemNormalizada[] {
  if (!Array.isArray(brutas)) return [];
  const vistas = new Set<string>();
  const saida: MensagemNormalizada[] = [];
  brutas.forEach((b, i) => {
    if (!b || typeof b !== "object") return;
    const m = b as Record<string, unknown>;
    const em = szDataParaIso(m.created_at);
    if (!em) return;
    const externoId = String(m.message_id ?? m._id ?? `${em}#${i}`);
    if (vistas.has(externoId)) return; // duplicata do provedor
    vistas.add(externoId);
    const autor = autorSz(m);
    saida.push({
      externoId,
      autor,
      agenteNome: autor === "agente" ? ((m.user as { name?: string } | undefined)?.name ?? null) : null,
      em,
      tipo: typeof m.type === "string" ? m.type : null,
      categoria: typeof m.wbs_session_category === "string" ? m.wbs_session_category : null,
      texto: textoSz(m),
    });
  });
  // eventos podem chegar fora de ordem: a ordem é sempre a do horário
  return saida.sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}

export function normalizarEventosSz(brutos: unknown): EventoCiclo[] {
  if (!Array.isArray(brutos)) return [];
  return brutos
    .map((e) => {
      const ev = e as Record<string, unknown>;
      const em = szDataParaIso(ev.created_at);
      const bruto = String(ev.event ?? "");
      return em ? { evento: MAPA_EVENTOS[bruto] ?? ("outro" as const), bruto, em } : null;
    })
    .filter((x): x is EventoCiclo => x !== null)
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}

export function normalizarConversaSz(
  item: Record<string, unknown>,
  mensagensBrutas: unknown,
  equipePorCampanha: Record<string, string>
): ConversaNormalizada {
  const agente = item.agent as { name?: string } | undefined;
  const contato = item.contact as { name?: string; number?: string } | undefined;
  const canal = item.channel as { description?: string } | undefined;
  const campanha = String(item.campaign_id ?? "");
  return {
    provedor: "szchat",
    externoId: String(item._id),
    protocolo: (item.protocol as string) || null,
    equipe: equipePorCampanha[campanha] ?? ((item.campaign as { name?: string } | undefined)?.name ?? null),
    canal: canal?.description ?? (typeof item.platform === "string" ? item.platform : null),
    agenteNome: agente?.name || null,
    agenteExternoId: (item.agent_id as string) || null,
    contatoNome: (item.name as string) || contato?.name || null,
    telefone: telefoneBrSz(item.platform_id) ?? telefoneBrSz(contato?.number) ?? telefoneBrSz(item.wa_id),
    statusFinal: (item.typeStatus as string) || null,
    finalizadaEm: szDataParaIso(item.finished_at),
    eventos: normalizarEventosSz(item.events),
    mensagens: normalizarMensagensSz(mensagensBrutas),
  };
}
