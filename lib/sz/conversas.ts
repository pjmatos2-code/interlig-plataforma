import "server-only";
import { SessaoSz } from "@/lib/sz/sessao";

/** campaign_id → equipe (as 3 monitoradas para o CRM). */
export const EQUIPES_CRM: Record<string, string> = {
  "60ac2ff88e7a9b0051a4cc1e": "Comercial Altamira",
  "68f91090cfadb8a0490e278d": "Comercial Vitória do Xingu",
  "68c862da49bc10dc1707f35f": "Comercial Brasil Novo",
};

/** lista de conversas com aviso de corte por orçamento de tempo */
export type ListaConversas = Conversa[] & { truncada?: boolean };

export type Conversa = {
  id: string;
  equipe: string;
  nome: string;
  telefone: string | null;
  agente: string | null;
  protocolo: string | null;
  quando: string | null;
  /** conversa já encerrada no SZ (finished_at presente) */
  finalizada: boolean;
  dialogo: { quem: "CLIENTE" | "AGENTE" | "IA" | "SISTEMA"; texto: string; hora: string }[];
};

function normalizarMensagem(m: Record<string, unknown>): Conversa["dialogo"][number] | null {
  const user = (m.user as { name?: string } | undefined)?.name;
  const origin = String(m.origin ?? "");
  const quem: Conversa["dialogo"][number]["quem"] = user
    ? "AGENTE"
    : origin === "channel"
      ? "CLIENTE"
      : origin === "system"
        ? "SISTEMA"
        : "IA";
  const raw = m.message;
  const texto =
    typeof raw === "string"
      ? raw
      : ((raw as { text?: string; caption?: string })?.text ??
        (raw as { caption?: string })?.caption ??
        `[${m.type}]`);
  const limpo = String(texto).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!limpo || limpo === "[undefined]") return null;
  return { quem, texto: limpo.slice(0, 400), hora: String(m.created_at ?? "").slice(0, 16) };
}

/** Lista as conversas das 3 equipes num intervalo (o filtro de equipe do SZ é
 *  ignorado pelo servidor, então paginamos tudo e filtramos por campaign_id). */
export async function listarConversasComerciais(
  sz: SessaoSz,
  inicio: string,
  fim: string,
  maxPaginas = 60,
  prazoMs?: number
): Promise<ListaConversas> {
  const achadas: ListaConversas = [];
  const limite = prazoMs ? Date.now() + prazoMs : null;
  const dateParam = encodeURIComponent(JSON.stringify({ start: inicio, end: fim }));
  for (let p = 1; p <= maxPaginas; p++) {
    if (limite && Date.now() > limite) {
      achadas.truncada = true; // o resto fica para o próximo ciclo
      break;
    }
    const rota = `/reports/messages/filter?page=${p}&channel=&contact=&protocol=&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`;
    const r = await sz.api(rota);
    if (!r.ok) break;
    const j = (await r.json()) as { data?: Record<string, unknown>[]; has_next?: boolean };
    for (const c of j.data ?? []) {
      const camp = String(c.campaign_id ?? "");
      if (!EQUIPES_CRM[camp]) continue;
      achadas.push({
        id: String(c._id),
        equipe: EQUIPES_CRM[camp],
        nome: String(c.name ?? "Sem nome"),
        telefone: (c.platform_id as string) || null,
        agente: (c.agent as { name?: string } | undefined)?.name ?? null,
        protocolo: (c.protocol as string) || null,
        quando: (c.dateFormatted as string) || null,
        finalizada: Boolean(c.finished_at),
        dialogo: [],
      });
    }
    if (!j.has_next) break;
  }
  return achadas;
}

/** Baixa o transcript de uma conversa. */
export async function carregarDialogo(
  sz: SessaoSz,
  conversa: Conversa,
  janela: { inicio: string; fim: string }
): Promise<void> {
  const r = await sz.api("/reports/messages/getTalks", {
    method: "POST",
    body: {
      date: { start: janela.inicio, end: janela.fim },
      session_id: conversa.id,
      date_search: { start: janela.inicio, end: janela.fim },
      view_conversation: "default",
      data_privacy: "hidden",
      allow_privacy: true,
      typeStatus: "all",
      copilot_score: "",
      attendance_classification: "",
      closing_reason: "",
    },
  });
  if (!r.ok) return;
  const msgs = (await r.json()) as Record<string, unknown>[];
  conversa.dialogo = (Array.isArray(msgs) ? msgs : [])
    .map(normalizarMensagem)
    .filter((x): x is Conversa["dialogo"][number] => x !== null);
}
