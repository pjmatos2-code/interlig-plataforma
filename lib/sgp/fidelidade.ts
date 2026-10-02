import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp } from "@/lib/sgp/painel";

/**
 * Fidelidade da base (01/10/2026) — contratos ATIVOS sem fidelidade e os que
 * vencem em breve, por unidade, lidos do relatório Financeiro → Fidelidades
 * do SGP. Quando a fidelidade vence, o SGP passa o contrato para "sem
 * fidelidade": vencida e sem fidelidade são a mesma lista.
 *
 * O filtro "Fidelidade (Fim)" do relatório é inclusivo (fim ≤ data), e
 * "dias restantes ≥ N" fecha a faixa por baixo — as faixas não se sobrepõem.
 */

export const UNIDADES_FIDELIDADE = [
  { pop: 1, nome: "Altamira" },
  { pop: 2, nome: "Vitória do Xingu" },
  { pop: 12, nome: "Brasil Novo" },
] as const;

export type FaixaFidelidade = "sem" | "ate30" | "ate60" | "ate90";

export const FAIXAS_FIDELIDADE: { chave: FaixaFidelidade; rotulo: string; de?: number; ate?: number }[] = [
  { chave: "sem", rotulo: "Sem fidelidade" },
  { chave: "ate30", rotulo: "Vence em até 30 dias", de: 1, ate: 30 },
  { chave: "ate60", rotulo: "31 a 60 dias", de: 31, ate: 60 },
  { chave: "ate90", rotulo: "61 a 90 dias", de: 61, ate: 90 },
];

/** dd/mm/aaaa de hoje + n dias, no fuso de Santarém */
function dataBr(dias: number): string {
  const d = new Date(Date.now() - 3 * 3600_000 + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/** filtros do relatório para uma unidade e faixa (status 1 = Ativo) */
export function filtrosFidelidade(pop: number, faixa: FaixaFidelidade): Record<string, string> {
  const base = { pop: String(pop), status_contrato: "1" };
  if (faixa === "sem") return { ...base, sem_fidelidade: "on" };
  const f = FAIXAS_FIDELIDADE.find((x) => x.chave === faixa)!;
  return {
    ...base,
    dias_restantes_op: "maior_igual",
    dias_restantes: String(f.de),
    data_fim_fidelidade: dataBr(f.ate!),
  };
}

/** link que abre o relatório do SGP já filtrado (a agente precisa estar logada no SGP) */
export function linkFidelidadeSgp(baseUrl: string, pop: number, faixa: FaixaFidelidade): string {
  const raiz = baseUrl.replace(/\/+$/, "").replace(/\/admin$/, "");
  return `${raiz}/admin/financeiro/relatorios/fidelidade/?${new URLSearchParams(filtrosFidelidade(pop, faixa))}`;
}

export type ResumoFidelidade = {
  atualizadoEm: string | null;
  unidades: { pop: number; nome: string; faixas: Record<FaixaFidelidade, number> }[];
};

export async function lerResumoFidelidade(): Promise<ResumoFidelidade> {
  const { data } = await criarClienteAdmin()
    .from("fidelidade_resumo")
    .select("pop_sgp_id, faixa, quantidade, atualizado_em");
  const linhas = data ?? [];
  const atualizadoEm = linhas.map((l) => l.atualizado_em as string).sort()[0] ?? null;
  return {
    atualizadoEm,
    unidades: UNIDADES_FIDELIDADE.map((u) => ({
      pop: u.pop,
      nome: u.nome,
      faixas: Object.fromEntries(
        FAIXAS_FIDELIDADE.map((f) => [
          f.chave,
          Number(linhas.find((l) => l.pop_sgp_id === u.pop && l.faixa === f.chave)?.quantidade ?? 0),
        ])
      ) as Record<FaixaFidelidade, number>,
    })),
  };
}

/**
 * Relê o relatório no SGP e grava as contagens. Cada unidade/faixa é gravada
 * assim que lida — se o orçamento acabar no meio, o que foi lido fica salvo.
 */
export async function atualizarResumoFidelidade(
  orcamentoMs = 150_000
): Promise<{ ok: boolean; lidas: number; erro?: string }> {
  const inicio = Date.now();
  const admin = criarClienteAdmin();
  const { data: cfgRow } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.painel_usuario || !cfg.painel_senha) {
    return { ok: false, lidas: 0, erro: "credencial do painel do SGP não configurada" };
  }
  const base = String(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "");
  const painel = new PainelSgp(base, cfg.painel_usuario, cfg.painel_senha);
  // começa pelas faixas mais antigas: se o orçamento acabar, o próximo ciclo
  // continua de onde parou em vez de reler sempre Altamira primeiro
  const { data: atuais } = await admin.from("fidelidade_resumo").select("pop_sgp_id, faixa, atualizado_em");
  const idade = (pop: number, faixa: string) =>
    (atuais ?? []).find((a) => a.pop_sgp_id === pop && a.faixa === faixa)?.atualizado_em ?? "";
  const fila = UNIDADES_FIDELIDADE.flatMap((u) => FAIXAS_FIDELIDADE.map((f) => ({ u, f }))).sort((a, b) =>
    idade(a.u.pop, a.f.chave) < idade(b.u.pop, b.f.chave) ? -1 : 1
  );
  let lidas = 0;
  try {
    await painel.login();
    for (const { u, f } of fila) {
      {
        if (Date.now() - inicio > orcamentoMs - 20_000) {
          return { ok: false, lidas, erro: "orçamento esgotado — continua na próxima atualização" };
        }
        const quantidade = await painel.contarRelatorioFidelidade(filtrosFidelidade(u.pop, f.chave));
        const { error } = await admin.from("fidelidade_resumo").upsert(
          { pop_sgp_id: u.pop, unidade: u.nome, faixa: f.chave, quantidade, atualizado_em: new Date().toISOString() },
          { onConflict: "pop_sgp_id,faixa" }
        );
        if (error) return { ok: false, lidas, erro: error.message };
        lidas++;
      }
    }
    return { ok: true, lidas };
  } catch (e) {
    return { ok: false, lidas, erro: e instanceof Error ? e.message : String(e) };
  }
}
