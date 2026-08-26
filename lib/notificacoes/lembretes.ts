import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Despacha os lembretes das ações agendadas do ticket ("ligar amanhã às
 * 10:00"): quando chega a hora, cria a notificação (sino) para a vendedora
 * responsável, o coordenador da equipe e o administrador — o mesmo fan-out
 * das demais notificações. Chamado pelas rotinas do CRM e pelo polling do
 * sino (15s), então o lembrete dispara em segundos quando há alguém online.
 */
export async function despacharLembretes(): Promise<number> {
  const admin = criarClienteAdmin();

  const { data: devidas } = await admin
    .from("ticket_acoes")
    .select("id, ticket_id, descricao, quando, tickets(cliente_nome, vendedor_id)")
    .is("notificado_em", null)
    .is("concluida_em", null)
    .lte("quando", new Date().toISOString())
    .limit(50);
  if (!devidas || devidas.length === 0) return 0;

  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, perfil, vendedor_id")
    .eq("ativo", true);
  const { data: vendedores } = await admin
    .from("vendedores")
    .select("id, coordenador_id");
  const coordDe = new Map((vendedores ?? []).map((v) => [v.id, v.coordenador_id]));

  let disparados = 0;
  for (const a of devidas) {
    const t = a.tickets as unknown as { cliente_nome: string; vendedor_id: string | null } | null;
    const vendedorId = t?.vendedor_id ?? null;
    const coordenadorId = vendedorId ? (coordDe.get(vendedorId) ?? null) : null;

    const destinatarios = (usuarios ?? []).filter(
      (u) =>
        u.perfil === "gestor" ||
        (vendedorId && u.vendedor_id === vendedorId) ||
        (coordenadorId && u.id === coordenadorId)
    );

    const hora = new Date(a.quando as string).toLocaleTimeString("pt-BR", {
      timeZone: "America/Santarem",
      hour: "2-digit",
      minute: "2-digit",
    });
    for (const u of destinatarios) {
      await admin.from("notificacoes").insert({
        destinatario_id: u.id,
        tipo: "lembrete",
        titulo: "⏰ Lembrete de ação",
        descricao: `${a.descricao} · ${t?.cliente_nome ?? "cliente"} · ${hora}`,
        link: `/crm/${a.ticket_id}`,
      });
    }
    await admin
      .from("ticket_acoes")
      .update({ notificado_em: new Date().toISOString() })
      .eq("id", a.id);
    disparados += 1;
  }
  return disparados;
}
