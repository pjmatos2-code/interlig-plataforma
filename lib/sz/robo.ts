import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { SessaoSz, lerCredenciaisSz } from "@/lib/sz/sessao";
import { listarConversasComerciais, carregarDialogo, EQUIPES_CRM } from "@/lib/sz/conversas";
import { gerarResumo } from "@/lib/sz/resumo";

function soDigitos(t: string | null): string | null {
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d || null;
}

function hojeSantarem(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export type ResultadoRobo = {
  ok: boolean;
  lidas: number;
  criados: number;
  atualizados: number;
  erro?: string;
  janela?: string;
};

/**
 * Rotina noturna: lê as conversas comerciais do dia no SZ, resume cada uma e
 * grava no CRM (cria ticket em "Contato inicial" ou atualiza o existente),
 * com resumo, próxima abordagem, urgência e follow-up para a manhã seguinte.
 */
export async function rodarRoboSz(dia?: string): Promise<ResultadoRobo> {
  const cred = await lerCredenciaisSz();
  if (!cred) return { ok: false, lidas: 0, criados: 0, atualizados: 0, erro: "credencial do robô SZ não configurada" };

  const admin = criarClienteAdmin();
  const alvo = dia ?? hojeSantarem();
  try {
    const sz = new SessaoSz(cred);
    await sz.login();

    const conversas = await listarConversasComerciais(sz, alvo, alvo);
    const { data: equipes } = await admin
      .from("sz_equipes_habilitadas")
      .select("nome, pop_id, ativo");
    const popPorEquipe = new Map(
      (equipes ?? []).filter((e) => e.ativo).map((e) => [e.nome, e.pop_id as string | null])
    );
    const { data: vends } = await admin.from("vendedores").select("id, nome, pop_id").eq("ativo", true);
    const acharVendedora = (agente: string | null, popId: string | null) => {
      if (!agente) return null;
      const primeiro = agente.split(/\s+/)[0].toLowerCase();
      const cands = (vends ?? []).filter((v) => v.nome.toLowerCase().includes(primeiro));
      return (cands.find((v) => v.pop_id === popId) ?? cands[0])?.id ?? null;
    };

    const amanha09 = new Date(Date.parse(`${alvo}T00:00:00-03:00`) + 33 * 3600_000).toISOString();

    let criados = 0;
    let atualizados = 0;
    for (const c of conversas) {
      await carregarDialogo(sz, c, { inicio: alvo, fim: alvo });
      if (c.dialogo.length === 0) continue;
      const r = await gerarResumo(c);
      const tel = soDigitos(c.telefone);
      const popId = popPorEquipe.get(c.equipe) ?? null;
      const vendedorId = acharVendedora(c.agente, popId);

      let existente: string | null = null;
      if (tel) {
        const { data: abertos } = await admin
          .from("tickets")
          .select("id, telefone")
          .neq("etapa", "fechado")
          .limit(2000);
        existente = (abertos ?? []).find((t) => soDigitos(t.telefone) === tel)?.id ?? null;
      }

      const campos = {
        resumo_tratativa: r.resumo,
        proxima_abordagem: r.proxima,
        urgencia: r.urgencia,
        resumo_em: new Date().toISOString(),
        followup_em: amanha09,
        sz_conversa_id: c.protocolo,
        atualizado_em: new Date().toISOString(),
      };

      if (existente) {
        await admin.from("tickets").update(campos).eq("id", existente);
        atualizados++;
      } else {
        const { data: novo } = await admin
          .from("tickets")
          .insert({
            origem_criacao: "sz_auto",
            cliente_nome: c.nome,
            telefone: tel,
            vendedor_id: vendedorId,
            pop_id: popId,
            etapa: "em_atendimento",
            primeira_tratativa_em: new Date().toISOString(),
            ...campos,
          })
          .select("id")
          .single();
        if (novo) criados++;
      }
    }

    return { ok: true, lidas: conversas.length, criados, atualizados, janela: alvo };
  } catch (e) {
    return { ok: false, lidas: 0, criados: 0, atualizados: 0, erro: e instanceof Error ? e.message : String(e), janela: alvo };
  }
}

export { EQUIPES_CRM };
