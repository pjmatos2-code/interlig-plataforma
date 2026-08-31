import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { carregarDialogo, type Conversa } from "@/lib/sz/conversas";
import { analisarFollowupComercial, type FollowupComercial } from "@/lib/ia/analista";

/**
 * Follow-up por IA no ticket do CRM.
 *
 * O transcript vem direto do SZ pela conversa vinculada ao ticket
 * (sz_conversa_id) — ninguém cola nada. A análise fica gravada no ticket e a
 * agente responsável a vê ali: interesse, onde parou, o que falta e a próxima
 * ação concreta.
 */

function montarTranscript(c: Conversa): string {
  return c.dialogo
    .map((m) => `${m.quem === "CLIENTE" ? "CLI" : m.quem === "AGENTE" ? "AGE" : "SIS"}: ${m.texto}`)
    .join("\n");
}

export async function analisarFollowupTicket(
  ticketId: string
): Promise<{ ok: boolean; erro?: string; analise?: FollowupComercial }> {
  const admin = criarClienteAdmin();
  const { data: t } = await admin
    .from("tickets")
    .select("id, sz_conversa_id, cliente_nome, criado_em, vendedores(nome)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { ok: false, erro: "Ticket não encontrado." };
  if (!t.sz_conversa_id)
    return { ok: false, erro: "Este ticket não tem conversa do SZ vinculada." };

  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, erro: "Credenciais do SZ Chat não configuradas." };
  const sz = new SessaoSz(cred);
  await sz.login();
  const conversa: Conversa = {
    id: t.sz_conversa_id as string,
    equipe: "",
    nome: (t.cliente_nome as string) ?? "",
    telefone: null,
    agente: null,
    protocolo: null,
    quando: null,
    dialogo: [],
  };
  // janela: do dia do ticket até hoje (conversas de WhatsApp atravessam dias)
  const inicio = String(t.criado_em).slice(0, 10);
  const fim = new Date().toISOString().slice(0, 10);
  await carregarDialogo(sz, conversa, { inicio, fim });
  const transcript = montarTranscript(conversa);
  if (transcript.length < 60)
    return { ok: false, erro: "Transcript vazio ou curto demais no SZ." };

  const analise = await analisarFollowupComercial(transcript, {
    agente: (t.vendedores as unknown as { nome: string } | null)?.nome ?? null,
  });
  if (!analise) return { ok: false, erro: "A análise não retornou um resultado válido." };

  await admin
    .from("tickets")
    .update({ analise_followup: analise, followup_analisado_em: new Date().toISOString() })
    .eq("id", ticketId);
  return { ok: true, analise };
}

/**
 * Lote: analisa os tickets ABERTOS com conversa do SZ ainda sem análise (ou
 * com análise anterior à última atividade). Usado pelo botão do gestor.
 */
export async function analisarFollowupsPendentes(
  limite = 20
): Promise<{ analisados: number; erros: number; detalhes: string[] }> {
  const admin = criarClienteAdmin();
  const { data: tickets } = await admin
    .from("tickets")
    .select("id, cliente_nome, followup_analisado_em, atualizado_em")
    .neq("etapa", "fechado")
    .not("sz_conversa_id", "is", null)
    .order("atualizado_em", { ascending: false })
    .limit(200);

  const fila = (tickets ?? [])
    .filter(
      (t) =>
        !t.followup_analisado_em ||
        String(t.followup_analisado_em) < String(t.atualizado_em)
    )
    .slice(0, limite);

  let analisados = 0,
    erros = 0;
  const detalhes: string[] = [];
  for (const t of fila) {
    const r = await analisarFollowupTicket(t.id as string);
    if (r.ok) analisados++;
    else {
      erros++;
      detalhes.push(`${t.cliente_nome}: ${r.erro}`);
    }
  }
  return { analisados, erros, detalhes: detalhes.slice(0, 5) };
}
