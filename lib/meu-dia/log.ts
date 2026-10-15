import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

/**
 * Log das ações manuais que concluem missões do Meu Dia (usuário, ticket ou
 * contrato, ação, resultado, motivo, data/hora). Nunca derruba a ação
 * principal: falha só vai para o console.
 */
export async function registrarLogMeuDia(e: {
  usuarioId: string | null;
  acao: string;
  ticketId?: string | null;
  contratoId?: string | null;
  vendedorId?: string | null;
  resultado?: string | null;
  motivo?: string | null;
  dados?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = criarClienteAdmin();
    let vendedorId = e.vendedorId ?? null;
    if (!vendedorId && e.ticketId) {
      const { data } = await admin.from("tickets").select("vendedor_id").eq("id", e.ticketId).maybeSingle();
      vendedorId = (data?.vendedor_id as string | null) ?? null;
    }
    if (!vendedorId && e.contratoId) {
      const { data } = await admin.from("contratos").select("vendedor_id").eq("id", e.contratoId).maybeSingle();
      vendedorId = (data?.vendedor_id as string | null) ?? null;
    }
    const { error } = await admin.from("meu_dia_log").insert({
      usuario_id: e.usuarioId,
      vendedor_id: vendedorId,
      ticket_id: e.ticketId ?? null,
      contrato_id: e.contratoId ?? null,
      acao: e.acao,
      resultado: e.resultado ?? null,
      motivo: e.motivo ?? null,
      dados: e.dados ?? {},
    });
    if (error) console.error("log meu dia:", error.message);
  } catch (err) {
    console.error("log meu dia:", err);
  }
}
