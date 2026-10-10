import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp } from "@/lib/sgp/painel";

/**
 * Cancelamentos oficiais (10/10/2026). A API da URA não informa QUANDO o
 * contrato foi cancelado — o sync carimba a data em que percebeu a mudança, e
 * antes carimbava a data da venda. Esta rotina lê o relatório "Contratos
 * Cancelados" do SGP e corrige data e motivo em `contratos`, guardando também
 * a situação anterior (Ativo = pediu para sair; Suspenso = débito).
 */

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const iso = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;

export async function atualizarCancelamentos(
  de: string,
  ate: string,
  painelPronto?: PainelSgp
): Promise<{ ok: boolean; lidos: number; corrigidos: number; erro?: string }> {
  const admin = criarClienteAdmin();
  try {
    let painel = painelPronto;
    if (!painel) {
      const { data: cfgRow } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
      const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
      if (!cfg.painel_usuario || !cfg.painel_senha) {
        return { ok: false, lidos: 0, corrigidos: 0, erro: "credencial do painel do SGP não configurada" };
      }
      const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
      painel = new PainelSgp(base, cfg.painel_usuario, cfg.painel_senha);
    }
    const linhas = await painel.linhasRelatorioCancelados(br(de), br(ate));
    const agora = new Date().toISOString();
    const registros = linhas.map((l) => ({
      sgp_contrato_id: l.contrato,
      data_cancelamento: iso(l.data),
      motivo: l.motivo || null,
      usuario: l.usuario || null,
      status_anterior: l.anterior || null,
      cliente: l.cliente || null,
      lido_em: agora,
    }));
    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await admin
        .from("cancelamentos_sgp")
        .upsert(registros.slice(i, i + 500), { onConflict: "sgp_contrato_id,data_cancelamento" });
      if (error) return { ok: false, lidos: linhas.length, corrigidos: 0, erro: error.message };
    }

    // o cancelamento mais recente de cada contrato (pode ter sido reativado e
    // cancelado de novo) — só corrige quem está cancelado HOJE na plataforma
    const ultimo = new Map<string, (typeof registros)[number]>();
    for (const r of registros) {
      const a = ultimo.get(r.sgp_contrato_id);
      if (!a || r.data_cancelamento > a.data_cancelamento) ultimo.set(r.sgp_contrato_id, r);
    }
    const ids = [...ultimo.keys()];
    let corrigidos = 0;
    for (let i = 0; i < ids.length; i += 300) {
      const { data: cts, error } = await admin
        .from("contratos")
        .select("id, sgp_contrato_id, data_venda, data_cancelamento, motivo_cancelamento")
        .eq("status", "cancelado")
        .in("sgp_contrato_id", ids.slice(i, i + 300));
      if (error) return { ok: false, lidos: linhas.length, corrigidos, erro: error.message };
      for (const c of cts ?? []) {
        const r = ultimo.get(c.sgp_contrato_id as string)!;
        // um cancelamento mais novo já registrado (fora deste período) vale mais
        if (c.data_cancelamento && (c.data_cancelamento as string) > r.data_cancelamento && (c.data_cancelamento as string) > ate) continue;
        // o banco exige cancelamento ≥ venda (contrato refeito com data nova)
        if (r.data_cancelamento < (c.data_venda as string)) continue;
        const motivo = r.motivo ?? (c.motivo_cancelamento as string | null);
        if (c.data_cancelamento === r.data_cancelamento && c.motivo_cancelamento === motivo) continue;
        const { error: e2 } = await admin
          .from("contratos")
          .update({ data_cancelamento: r.data_cancelamento, motivo_cancelamento: motivo })
          .eq("id", c.id as string);
        if (e2) {
          console.error(`cancelamento ${c.sgp_contrato_id}:`, e2.message);
          continue;
        }
        corrigidos++;
      }
    }
    return { ok: true, lidos: linhas.length, corrigidos };
  } catch (e) {
    return { ok: false, lidos: 0, corrigidos: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
