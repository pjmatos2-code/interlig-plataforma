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

/**
 * Fora da lista de contato (gestor, 01/10/2026): permutas, isentos e órgãos
 * públicos. "INTERLIG PLAY ISENTO" é o SVA que acompanha a internet de quase
 * todo cliente — não torna o contrato isento.
 */
const PERMUTA = /PERMUTA/i;
const ORGAO_PUBLICO =
  /PREFEITURA|FUNDO MUNICIPAL|SECRETARIA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|PREF\.? ?ATM|SEMED|SESPA|CENTRO REGIONAL DE SA[UÚ]DE|GOVERNO|ESTADO DO PAR/i;
const PLANO_ISENTO = /ISENT|CORTESIA|CONTROLE INTERNO/i;

function motivoExclusao(texto: string, mensalidadeZero: boolean): string | null {
  if (PERMUTA.test(texto)) return "permuta";
  if (ORGAO_PUBLICO.test(texto)) return "órgão público";
  if (mensalidadeZero || PLANO_ISENTO.test(texto.replace(/PLAY ISENTO/gi, ""))) return "isento";
  return null;
}

/**
 * Família do plano para o gráfico (gestor, 03/10/2026): velocidade + se é
 * corporativo. "1GB SPEEDMAX INDIVIDUAL | PÓS PAGO" → "1 GB";
 * "FIBRA CORPORATE 500MB" / "… | PJ |" / "DEDICADO" → "… corporativo".
 */
export function familiaPlano(nome: string | null | undefined): string {
  const n = String(nome ?? "").toUpperCase();
  if (!n.trim()) return "Plano não identificado";
  if (/REDE NEUTRA/.test(n)) return "Rede neutra (Netsky)";
  if (/LIGCHIP/.test(n)) return "LigChip (chip)";
  if (/FONE|TELEFONIA/.test(n)) return "Telefonia";
  if (/\bPLAY\b/.test(n)) return "Interlig Play";
  const corporativo = /CORPORATE|\bPJ\b|DEDICADO|COMERCIAL|EMPRESARIAL|SEMED|SAUDE|SESPA|PREF/.test(n);
  const m = n.match(/(\d+)\s*(GB|MBPS|MB|MEGA)/);
  // sem velocidade no nome (Fibra Mult, Fibra Gamer…): o próprio nome do plano
  const semVel = n.split(/\s[-|]\s|\|/)[0].trim().toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
  let vel = m ? `${m[1]} ${m[2] === "GB" ? "GB" : "MB"}` : semVel || "Outros planos";
  if (/R[AÁ]DIO/.test(n) && m) vel = `Rádio ${vel}`;
  return corporativo && m ? `${vel} corporativo` : vel;
}

/** plano de internet citado na 1ª coluna do relatório (fallback sem cadastro) */
function planoDoTexto(texto: string): string | null {
  const partes = texto.split(/,\s*/).filter((p) => /\d+\s*(MB|GB|MEGA)/i.test(p) && !/PLAY|CURSOS|LIGCHIP/i.test(p));
  return partes[0] ?? null;
}

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
  unidades: {
    pop: number;
    nome: string;
    faixas: Record<FaixaFidelidade, number>;
    /** permutas, isentos e órgãos públicos tirados da contagem (o SGP ainda os lista) */
    excluidos: Record<FaixaFidelidade, number>;
    /** contratos por família de plano, em cada faixa */
    planos: Record<FaixaFidelidade, Record<string, number>>;
  }[];
};

export async function lerResumoFidelidade(): Promise<ResumoFidelidade> {
  const { data } = await criarClienteAdmin()
    .from("fidelidade_resumo")
    .select("pop_sgp_id, faixa, quantidade, excluidos, planos, atualizado_em");
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
      planos: Object.fromEntries(
        FAIXAS_FIDELIDADE.map((f) => [
          f.chave,
          ((linhas.find((l) => l.pop_sgp_id === u.pop && l.faixa === f.chave)?.planos ?? {}) as Record<string, number>),
        ])
      ) as Record<FaixaFidelidade, Record<string, number>>,
      excluidos: Object.fromEntries(
        FAIXAS_FIDELIDADE.map((f) => [
          f.chave,
          Number(linhas.find((l) => l.pop_sgp_id === u.pop && l.faixa === f.chave)?.excluidos ?? 0),
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
        const linhas = await painel.linhasRelatorioFidelidade(filtrosFidelidade(u.pop, f.chave));
        // cadastro: mensalidade zero = isento (controle interno, teste,
        // cortesia) e o plano do contrato para o gráfico
        const zerados = new Set<string>();
        const planoDe = new Map<string, string>();
        const ids = linhas.map((l) => l.contrato).filter(Boolean);
        for (let i = 0; i < ids.length; i += 300) {
          const { data: cts } = await admin
            .from("contratos")
            .select("sgp_contrato_id, valor_mensalidade, planos(nome)")
            .in("sgp_contrato_id", ids.slice(i, i + 300));
          for (const c of cts ?? []) {
            if (Number(c.valor_mensalidade) === 0) zerados.add(c.sgp_contrato_id as string);
            const nome = (c.planos as unknown as { nome: string } | null)?.nome;
            if (nome) planoDe.set(c.sgp_contrato_id as string, nome);
          }
        }
        const contam = linhas.filter((l) => !motivoExclusao(l.texto, zerados.has(l.contrato)));
        const excluidos = linhas.length - contam.length;
        const planos: Record<string, number> = {};
        for (const l of contam) {
          // o plano de INTERNET do relatório vale mais que o do cadastro (no
          // cadastro, o principal às vezes é o SVA "Interlig Play")
          const fam = familiaPlano(planoDoTexto(l.texto) ?? planoDe.get(l.contrato));
          planos[fam] = (planos[fam] ?? 0) + 1;
        }
        const { error } = await admin.from("fidelidade_resumo").upsert(
          {
            pop_sgp_id: u.pop,
            unidade: u.nome,
            faixa: f.chave,
            quantidade: linhas.length - excluidos,
            excluidos,
            planos,
            atualizado_em: new Date().toISOString(),
          },
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
