import "server-only";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { EQUIPES_CRM } from "@/lib/sz/conversas";
import { lerJsonSz } from "./sz-resposta";

/**
 * Adaptador SZ Chat — leitura (24/10/2026). SOMENTE LEITURA: usa a mesma
 * sessão do robô (usuário dedicado) e os mesmos dois relatórios que o robô
 * comercial já consome. Nunca envia mensagem nem altera nada no SZ.
 *
 * O filtro de data do relatório seleciona pela data de ENCERRAMENTO da
 * conversa (sondagem de 24/10: pedido do dia 23 trouxe uma conversa aberta
 * no dia 21 e encerrada no 23). O filtro de equipe é ignorado pelo servidor,
 * então filtramos por campaign_id aqui (as 3 equipes comerciais do CRM).
 */

export const EQUIPES_COMERCIAIS = EQUIPES_CRM;

export async function abrirSessaoSz(): Promise<SessaoSz | null> {
  const cred = await lerCredenciaisSz();
  if (!cred) return null;
  const sz = new SessaoSz(cred);
  await sz.login();
  return sz;
}

export type PaginaConversas = {
  itens: Record<string, unknown>[];
  /** próxima página a ler (null = acabou) */
  proximaPagina: number | null;
  paginasLidas: number;
};

/** conversas comerciais encerradas no dia (aaaa-mm-dd, Santarém) */
export async function listarEncerradasDoDia(
  sz: SessaoSz,
  dia: string,
  opts: { paginaInicial?: number; prazoMs?: number; maxPaginas?: number } = {}
): Promise<PaginaConversas> {
  const limite = opts.prazoMs ? Date.now() + opts.prazoMs : null;
  const dateParam = encodeURIComponent(JSON.stringify({ start: dia, end: dia }));
  const itens: Record<string, unknown>[] = [];
  let pagina = opts.paginaInicial ?? 1;
  let lidas = 0;
  const max = opts.maxPaginas ?? 120;
  while (lidas < max) {
    if (limite && Date.now() > limite) return { itens, proximaPagina: pagina, paginasLidas: lidas };
    const rota = `/reports/messages/filter?page=${pagina}&channel=&contact=&protocol=&agent=&contactName=&attendance=&platform_id=&options_conversations=all&view_conversation=default&data_privacy=hidden&typeStatus=all&copilot_score=&attendance_classification=&closing_reason=&finalCampaign=&finalAgent=&date=${dateParam}`;
    const r = await sz.api(rota);
    const j = (await lerJsonSz(r, `relatório, página ${pagina}`)) as { data?: Record<string, unknown>[]; has_next?: boolean };
    lidas++;
    for (const c of j.data ?? []) if (EQUIPES_COMERCIAIS[String(c.campaign_id ?? "")]) itens.push(c);
    if (!j.has_next) return { itens, proximaPagina: null, paginasLidas: lidas };
    pagina++;
  }
  return { itens, proximaPagina: pagina, paginasLidas: lidas };
}

/** transcript completo da sessão (o SZ devolve a sessão inteira pelo id) */
export async function baixarMensagensSz(sz: SessaoSz, externoId: string, dia: string): Promise<unknown[]> {
  const r = await sz.api("/reports/messages/getTalks", {
    method: "POST",
    body: {
      date: { start: dia, end: dia },
      session_id: externoId,
      date_search: { start: dia, end: dia },
      view_conversation: "default",
      data_privacy: "hidden",
      allow_privacy: true,
      typeStatus: "all",
      copilot_score: "",
      attendance_classification: "",
      closing_reason: "",
    },
  });
  const j = await lerJsonSz(r, "transcript");
  return Array.isArray(j) ? j : [];
}
