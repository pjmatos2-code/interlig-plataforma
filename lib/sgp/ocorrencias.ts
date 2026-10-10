import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp } from "@/lib/sgp/painel";

/**
 * Ocorrências de atendimento do SGP (10/10/2026). Os chamados de suporte
 * (Acesso lento, Link loss, Luz alta, Sem acesso, Outros, Chamado Fortics),
 * a cobrança e os pedidos de cancelamento/retenção nascem como OCORRÊNCIA no
 * SGP — só parte vira OS. É o histórico que alimenta o risco de cancelamento.
 */

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** "29/09/2026 23:18:44" → ISO no fuso de Santarém */
function dataHora(t: string | undefined): string | null {
  const m = (t ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}

export async function atualizarOcorrencias(
  de: string,
  ate: string,
  painelPronto?: PainelSgp
): Promise<{ ok: boolean; lidas: number; erro?: string }> {
  const admin = criarClienteAdmin();
  try {
    let painel = painelPronto;
    if (!painel) {
      const { data: cfgRow } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
      const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
      if (!cfg.painel_usuario || !cfg.painel_senha) {
        return { ok: false, lidas: 0, erro: "credencial do painel do SGP não configurada" };
      }
      const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
      painel = new PainelSgp(base, cfg.painel_usuario, cfg.painel_senha);
    }
    const linhas = await painel.linhasRelatorioOcorrencias(br(de), br(ate));
    const agora = new Date().toISOString();
    const registros = linhas.map((l) => ({
      sgp_ocorrencia_id: l.ID,
      // "4662 - NOME DO CLIENTE": o número é o id do CONTRATO
      sgp_contrato_id: l["Cliente/Contrato"]?.match(/^(\d+)\s*-/)?.[1] ?? null,
      sgp_cliente_id: l.sgp_cliente_id || null,
      tipo: l["Tipo"] || null,
      metodo: l["Método"] || null,
      status: l["Status"] || null,
      criada_em: dataHora(l["Criada"]),
      encerrada_em: dataHora(l["Encerrada"]),
      usuario: l["Usuário"] || null,
      pop: l["POP"] || null,
      sgp_os_id: l["OS"]?.match(/^(\d+)/)?.[1] ?? null,
      lido_em: agora,
    }));
    for (let i = 0; i < registros.length; i += 500) {
      const { error } = await admin
        .from("ocorrencias_sgp")
        .upsert(registros.slice(i, i + 500), { onConflict: "sgp_ocorrencia_id" });
      if (error) return { ok: false, lidas: i, erro: error.message };
    }
    return { ok: true, lidas: registros.length };
  } catch (e) {
    return { ok: false, lidas: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
