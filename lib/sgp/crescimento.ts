import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp } from "@/lib/sgp/painel";

/**
 * Base das unidades (Relatórios > Contratos > Crescimento do SGP), 1x/dia.
 * Alimenta a "Base das unidades" e a meta do ano no Dashboard.
 *
 * Saiu do fim do /api/sync em 27/11/2026: lá ela começava com ~60 s de ciclo
 * sobrando, precisa de ~50 s (6 relatórios, ~8 s cada) e não olhava o relógio.
 * De 19/11 a 26/11 a função morreu no teto em TODOS os ciclos, sempre na
 * terceira unidade — Brasil Novo parou em 18/11 — e levou junto o que vinha
 * depois no ciclo (rotinas do CRM, atendimentos e enriquecimento do SZ). Como
 * a marca "já li hoje" só era gravada no fim, repetia a cada ciclo.
 *
 * Agora roda em /api/sync/rotinas com orçamento próprio: confere o tempo
 * antes de cada unidade, começa pela mais atrasada e, se faltar tempo, devolve
 * `completo: false` para continuar na próxima vez.
 */

// unidade = POP residencial + POP corporativo da mesma cidade (ids do SGP)
const UNIDADES: [string, number[]][] = [
  ["Altamira", [1, 16]],
  ["Vitória do Xingu", [2, 17]],
  ["Brasil Novo", [12, 18]],
];

/** tempo que uma unidade pode levar (2 relatórios + gravação), com folga */
const RESERVA_POR_UNIDADE_MS = 25_000;

export async function atualizarCrescimentoBase(
  orcamentoMs: number
): Promise<{ ok: boolean; completo: boolean; gravados: number; unidades: string[]; erro?: string }> {
  const inicio = Date.now();
  const admin = criarClienteAdmin();
  const feitas: string[] = [];
  let gravados = 0;
  try {
    const { data: cfgRow } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
    const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
    if (!cfg.painel_usuario || !cfg.painel_senha) {
      return { ok: false, completo: false, gravados: 0, unidades: [], erro: "credencial do painel do SGP não configurada" };
    }
    const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
    const painel = new PainelSgp(base, cfg.painel_usuario, cfg.painel_senha);

    // a mais atrasada primeiro: se o tempo acabar, ninguém fica para trás de novo
    const { data: lidas } = await admin.from("crescimento_base").select("unidade, atualizado_em").order("atualizado_em", { ascending: false });
    const ultimaLeitura = new Map<string, string>();
    for (const l of lidas ?? []) if (!ultimaLeitura.has(l.unidade as string)) ultimaLeitura.set(l.unidade as string, String(l.atualizado_em ?? ""));
    const fila = [...UNIDADES].sort((a, b) => (ultimaLeitura.get(a[0]) ?? "").localeCompare(ultimaLeitura.get(b[0]) ?? ""));

    for (const [unidade, pops] of fila) {
      if (orcamentoMs - (Date.now() - inicio) < RESERVA_POR_UNIDADE_MS) {
        return { ok: true, completo: false, gravados, unidades: feitas };
      }
      const porMes = new Map<string, { ativos: number; novos: number; canceladosAcum: number; suspensos: number }>();
      for (const pop of pops) {
        for (const l of await painel.crescimentoContratos(pop, 8)) {
          const acc = porMes.get(l.mes) ?? { ativos: 0, novos: 0, canceladosAcum: 0, suspensos: 0 };
          acc.ativos += l.ativos;
          acc.novos += l.novos;
          acc.canceladosAcum += l.canceladosAcum;
          acc.suspensos += l.suspensos;
          porMes.set(l.mes, acc);
        }
      }
      const meses = [...porMes.keys()].sort();
      // relatório vazio (painel fora do ar, sessão recusada): não conta como lida
      if (meses.length < 2) {
        return { ok: false, completo: false, gravados, unidades: feitas, erro: `${unidade}: o relatório Crescimento veio vazio` };
      }
      const agora = new Date().toISOString();
      // o primeiro mês serve só de base para o "cancelados no mês" do seguinte
      const linhas = meses.slice(1).map((mes, i) => {
        const m = porMes.get(mes)!;
        const anterior = porMes.get(meses[i])!;
        return {
          mes,
          unidade,
          ativos: m.ativos,
          novos: m.novos,
          cancelados_mes: Math.max(0, m.canceladosAcum - anterior.canceladosAcum),
          cancelados_acum: m.canceladosAcum,
          suspensos: m.suspensos,
          atualizado_em: agora,
        };
      });
      const { error } = await admin.from("crescimento_base").upsert(linhas);
      if (error) return { ok: false, completo: false, gravados, unidades: feitas, erro: `${unidade}: ${error.message}` };
      gravados += linhas.length;
      feitas.push(unidade);
    }
    return { ok: true, completo: true, gravados, unidades: feitas };
  } catch (e) {
    return { ok: false, completo: false, gravados, unidades: feitas, erro: e instanceof Error ? e.message : String(e) };
  }
}
