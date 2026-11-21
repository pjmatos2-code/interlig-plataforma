import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp } from "@/lib/sgp/painel";
import { DIRECIONAMENTO_DESDE, TIPOS_DIRECIONAMENTO, direcionamentoDaPagina } from "@/lib/operacao/direcionamento";

type Admin = ReturnType<typeof criarClienteAdmin>;

/**
 * Hora do direcionamento ao gestor técnico (21/11/2026). Abre, no SGP, a
 * página de cada ocorrência de instalação/mudança de endereço que já tem
 * responsável e ainda não tem a hora gravada, e lê o registro de alterações.
 * Só leitura no SGP; uma página por ocorrência, uma vez só (depois de
 * gravada, não volta a ser aberta). Sem conclusão, tenta de novo em 2 h.
 */
export async function lerDirecionamentos(
  admin: Admin,
  opcoes: { limite?: number; orcamentoMs?: number } = {}
): Promise<{ ok: boolean; abertas: number; gravadas: number; erro?: string }> {
  const limite = opcoes.limite ?? 30;
  const ate = Date.now() + (opcoes.orcamentoMs ?? 60_000);
  const duasHoras = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: fila, error } = await admin
    .from("ocorrencias_sgp")
    .select("sgp_ocorrencia_id, criada_em, responsavel")
    .in("tipo", TIPOS_DIRECIONAMENTO)
    .gte("criada_em", `${DIRECIONAMENTO_DESDE}T00:00:00-03:00`)
    .is("direcionada_em", null)
    .not("responsavel", "is", null)
    // relê a cada 2 h só enquanto a ocorrência estiver aberta
    .or(`direcionamento_lido_em.is.null,and(direcionamento_lido_em.lt.${duasHoras},status.not.ilike.*ncerrad*)`)
    .order("criada_em", { ascending: true })
    .limit(limite);
  if (error) return { ok: false, abertas: 0, gravadas: 0, erro: error.message };
  if (!fila?.length) return { ok: true, abertas: 0, gravadas: 0 };

  const { data: cfgRow } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.painel_usuario || !cfg.painel_senha) return { ok: false, abertas: 0, gravadas: 0, erro: "credencial do painel do SGP não configurada" };
  const painel = new PainelSgp(String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, ""), cfg.painel_usuario, cfg.painel_senha);

  let abertas = 0;
  let gravadas = 0;
  let ultimoErro: string | undefined;
  for (const o of fila) {
    if (Date.now() > ate) break;
    const id = String(o.sgp_ocorrencia_id);
    try {
      const html = await painel.paginaOcorrencia(id);
      abertas++;
      const d = direcionamentoDaPagina(html, { criadaEm: String(o.criada_em), responsavel: (o.responsavel as string | null) ?? null });
      const agora = new Date().toISOString();
      const { error: e } = await admin
        .from("ocorrencias_sgp")
        .update(d ? { direcionada_em: d.em, direcionada_para: d.para, direcionamento_origem: d.origem, direcionamento_lido_em: agora } : { direcionamento_lido_em: agora })
        .eq("sgp_ocorrencia_id", id);
      if (e) ultimoErro = e.message;
      else if (d) gravadas++;
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      // marca para não insistir na mesma página a cada 15 min
      await admin.from("ocorrencias_sgp").update({ direcionamento_lido_em: new Date().toISOString() }).eq("sgp_ocorrencia_id", id);
    }
  }
  return { ok: !ultimoErro || gravadas > 0, abertas, gravadas, erro: ultimoErro };
}
