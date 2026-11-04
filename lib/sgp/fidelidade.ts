import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { PainelSgp, type LinhaFidelidadeSgp } from "@/lib/sgp/painel";
import type { Usuario } from "@/lib/tipos";

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
  /PREFEITURA|FUNDO MUNICIPAL|SECRETARIA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|PREF\.? ?ATM|SEMED|SESPA|CENTRO REGIONAL DE SA[UÚ]DE|GOVERNO|ESTADO DO PAR|FUNDA[CÇ][AÃ]O NACIONAL|FUNDA[CÇ][AÃ]O INSTITUTO BRASILEIRO|AG[EÊ]NCIA BRASILEIRA|CONSELHO ESCOLAR|CONS[OÓ]RCIO POLICL|POL[IÍ]CIA MILITAR|MINIST[EÉ]RIO P[UÚ]BLICO|TRIBUNAL|DEFENSORIA|INSTITUTO FEDERAL|UNIVERSIDADE FEDERAL/i;
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
 * Uma leitura do relatório (unidade e faixa) → o que conta, o grupo de plano
 * de cada contrato e as contagens do gráfico. Função pura: a lista e o
 * gráfico saem da mesma conta.
 */
export function montarLeituraFidelidade(
  pop: number,
  faixa: FaixaFidelidade,
  linhas: LinhaFidelidadeSgp[],
  cadastro: { zerados: Set<string>; planoDe: Map<string, string> },
  lidaEm: string
) {
  const contam = linhas.filter((l) => !motivoExclusao(l.texto, cadastro.zerados.has(l.contrato)));
  const planos: Record<string, number> = {};
  const lista = contam.map((l) => {
    // o plano de INTERNET do relatório vale mais que o do cadastro (no
    // cadastro, o principal às vezes é o SVA "Interlig Play")
    const plano = planoDoTexto(l.texto) ?? cadastro.planoDe.get(l.contrato) ?? null;
    const familia = familiaPlano(plano);
    planos[familia] = (planos[familia] ?? 0) + 1;
    return {
      pop_sgp_id: pop,
      faixa,
      sgp_contrato_id: l.contrato,
      sgp_cliente_id: l.clienteId,
      cliente: l.cliente,
      plano,
      familia,
      fim_fidelidade: l.fim,
      dias_restantes: l.dias,
      atualizado_em: lidaEm,
    };
  });
  return { lista, planos, excluidos: linhas.length - contam.length };
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
        // uma linha por contrato: linha sem número de contrato não é contrato
        // (ex.: aviso de lista vazia) e a lista nominal não aceita repetido
        const vistos = new Set<string>();
        const linhas = (await painel.linhasRelatorioFidelidade(filtrosFidelidade(u.pop, f.chave))).filter(
          (l) => l.contrato && !vistos.has(l.contrato) && vistos.add(l.contrato)
        );
        // cadastro: mensalidade zero = isento (controle interno, teste,
        // cortesia) e o plano do contrato para o gráfico
        const zerados = new Set<string>();
        const planoDe = new Map<string, string>();
        const ids = linhas.map((l) => l.contrato);
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
        const lidaEm = new Date().toISOString();
        const { lista, planos, excluidos } = montarLeituraFidelidade(u.pop, f.chave, linhas, { zerados, planoDe }, lidaEm);
        // lista nominal (04/11/2026): grava a leitura nova e só depois tira
        // quem saiu da faixa — a lista nunca fica vazia no meio da troca
        for (let i = 0; i < lista.length; i += 500) {
          const { error: e1 } = await admin
            .from("fidelidade_contratos")
            .upsert(lista.slice(i, i + 500), { onConflict: "pop_sgp_id,faixa,sgp_contrato_id" });
          if (e1) return { ok: false, lidas, erro: `lista de ${u.nome}: ${e1.message}` };
        }
        const { error: e2 } = await admin
          .from("fidelidade_contratos")
          .delete()
          .eq("pop_sgp_id", u.pop)
          .eq("faixa", f.chave)
          .lt("atualizado_em", lidaEm);
        if (e2) return { ok: false, lidas, erro: `lista de ${u.nome}: ${e2.message}` };
        const { error } = await admin.from("fidelidade_resumo").upsert(
          {
            pop_sgp_id: u.pop,
            unidade: u.nome,
            faixa: f.chave,
            quantidade: linhas.length - excluidos,
            excluidos,
            planos,
            atualizado_em: lidaEm,
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

/** quantos planos o gráfico mostra antes de juntar o resto em "Outros N planos" */
export const LIMITE_PLANOS_GRAFICO = 14;

/**
 * Planos de uma faixa, somados nas unidades do escopo (pop null = todas), do
 * maior para o menor. O gráfico e a lista usam a mesma conta, para que
 * "Outros N planos" abra exatamente os planos que o gráfico juntou.
 */
export function planosDoEscopo(
  unidades: ResumoFidelidade["unidades"],
  pop: number | null,
  faixa: FaixaFidelidade
): { principais: [string, number][]; resto: [string, number][]; total: number } {
  const soma = new Map<string, number>();
  for (const u of unidades) {
    if (pop && u.pop !== pop) continue;
    for (const [plano, n] of Object.entries(u.planos[faixa] ?? {})) soma.set(plano, (soma.get(plano) ?? 0) + n);
  }
  const ordenado = [...soma.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  return {
    principais: ordenado.slice(0, LIMITE_PLANOS_GRAFICO),
    resto: ordenado.slice(LIMITE_PLANOS_GRAFICO),
    total: ordenado.reduce((t, [, n]) => t + n, 0),
  };
}

/**
 * Quem abre a fidelidade da base: gestor, direção e agentes de atendimento
 * veem tudo; a coordenação de unidade (Brasil Novo, Vitória do Xingu) só a
 * própria base. A coordenação de Altamira cuida de equipes e não acessa.
 * null = sem acesso.
 */
export async function escopoFidelidade(
  usuario: Pick<Usuario, "perfil" | "pop_id">
): Promise<{ unidadeFixa: { pop: number; nome: string } | null } | null> {
  if (["gestor", "direcao", "agente_atendimento"].includes(usuario.perfil)) return { unidadeFixa: null };
  if (usuario.perfil !== "supervisor" || !usuario.pop_id) return null;
  const { data } = await criarClienteAdmin().from("pops").select("nome").eq("id", usuario.pop_id).maybeSingle();
  const nome = String(data?.nome ?? "");
  const u = UNIDADES_FIDELIDADE.find((x) => x.nome === nome);
  if (!u || !["Brasil Novo", "Vitória do Xingu"].includes(u.nome)) return null;
  return { unidadeFixa: { pop: u.pop, nome: u.nome } };
}

export type ClienteFidelidade = {
  pop: number;
  unidade: string;
  contrato: string;
  clienteId: string | null;
  cliente: string;
  /** só dígitos, com DDD (10 ou 11) — null se o cadastro não tem */
  telefone: string | null;
  plano: string | null;
  familia: string;
  mensalidade: number | null;
  fim: string | null;
  dias: number | null;
};

/** telefone do cadastro → só dígitos com DDD, sem o 55 */
export function telefoneLimpo(bruto: string | null | undefined): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** "93991234567" → "(93) 99123-4567" */
export function formatarTelefone(d: string): string {
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
}

/**
 * Lista nominal de uma faixa: os contratos gravados na última leitura do SGP
 * (só os que contam), com nome, telefone e mensalidade do cadastro. pop null
 * = todas as unidades; familias null = todos os planos.
 */
export async function lerListaFidelidade(
  faixa: FaixaFidelidade,
  pop: number | null,
  familias: string[] | null
): Promise<{ clientes: ClienteFidelidade[]; atualizadoEm: string | null }> {
  if (familias && familias.length === 0) return { clientes: [], atualizadoEm: null };
  const admin = criarClienteAdmin();
  type Linha = {
    pop_sgp_id: number;
    sgp_contrato_id: string;
    sgp_cliente_id: string | null;
    cliente: string | null;
    plano: string | null;
    familia: string;
    fim_fidelidade: string | null;
    dias_restantes: number | null;
    atualizado_em: string;
  };
  const linhas: Linha[] = [];
  // o PostgREST corta em 1.000 linhas por resposta
  for (let de = 0; de < 50_000; de += 1000) {
    let q = admin
      .from("fidelidade_contratos")
      .select("pop_sgp_id, sgp_contrato_id, sgp_cliente_id, cliente, plano, familia, fim_fidelidade, dias_restantes, atualizado_em")
      .eq("faixa", faixa)
      .order("pop_sgp_id")
      .order("sgp_contrato_id")
      .range(de, de + 999);
    if (pop) q = q.eq("pop_sgp_id", pop);
    if (familias) q = q.in("familia", familias);
    const { data, error } = await q;
    if (error) throw new Error(`lista da fidelidade: ${error.message}`);
    linhas.push(...((data ?? []) as Linha[]));
    if ((data ?? []).length < 1000) break;
  }
  const cadastro = new Map<string, { nome: string | null; telefone: string | null; mensalidade: number | null }>();
  const ids = linhas.map((l) => l.sgp_contrato_id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await admin
      .from("contratos")
      .select("sgp_contrato_id, valor_mensalidade, clientes(nome, telefone)")
      .in("sgp_contrato_id", ids.slice(i, i + 300));
    if (error) throw new Error(`cadastro da fidelidade: ${error.message}`);
    for (const c of data ?? []) {
      const cl = c.clientes as unknown as { nome: string | null; telefone: string | null } | null;
      cadastro.set(String(c.sgp_contrato_id), {
        nome: cl?.nome ?? null,
        telefone: telefoneLimpo(cl?.telefone),
        mensalidade: c.valor_mensalidade == null ? null : Number(c.valor_mensalidade),
      });
    }
  }
  const nomeUnidade = new Map<number, string>(UNIDADES_FIDELIDADE.map((u) => [u.pop, u.nome]));
  const clientes = linhas.map((l): ClienteFidelidade => {
    const c = cadastro.get(l.sgp_contrato_id);
    return {
      pop: l.pop_sgp_id,
      unidade: nomeUnidade.get(l.pop_sgp_id) ?? String(l.pop_sgp_id),
      contrato: l.sgp_contrato_id,
      clienteId: l.sgp_cliente_id,
      cliente: (c?.nome || l.cliente || `Contrato ${l.sgp_contrato_id}`).trim(),
      telefone: c?.telefone ?? null,
      plano: l.plano,
      familia: l.familia,
      mensalidade: c?.mensalidade ?? null,
      fim: l.fim_fidelidade,
      dias: l.dias_restantes,
    };
  });
  // quem vence primeiro no topo; sem fidelidade, por nome
  clientes.sort((a, b) =>
    faixa === "sem"
      ? a.cliente.localeCompare(b.cliente, "pt-BR")
      : (a.dias ?? 99_999) - (b.dias ?? 99_999) || a.cliente.localeCompare(b.cliente, "pt-BR")
  );
  const atualizadoEm = linhas.map((l) => l.atualizado_em).sort()[0] ?? null;
  return { clientes, atualizadoEm };
}

/** o que a lista e a planilha mostram: faixa, unidade e plano (ou "outros") */
export type FiltroListaFidelidade = {
  faixa: FaixaFidelidade;
  /** pop do SGP; null = todas as unidades */
  pop: number | null;
  /** grupo do plano (o rótulo do gráfico); null = todos os planos */
  plano: string | null;
  /** os planos que o gráfico juntou em "Outros N planos" */
  outros: boolean;
};

export function lerFiltroLista(
  p: { faixa?: string | null; unidade?: string | null; plano?: string | null; outros?: string | null },
  unidadeFixa: { pop: number } | null
): FiltroListaFidelidade {
  const faixa = FAIXAS_FIDELIDADE.find((f) => f.chave === p.faixa)?.chave ?? "sem";
  const pedido = UNIDADES_FIDELIDADE.find((u) => String(u.pop) === p.unidade)?.pop ?? null;
  const outros = p.outros === "1";
  const plano = !outros && p.plano?.trim() ? p.plano.trim().slice(0, 120) : null;
  return { faixa, pop: unidadeFixa?.pop ?? pedido, plano, outros };
}

/** querystring da lista/planilha para um filtro (sem a unidade quando é fixa) */
export function queryLista(f: Partial<FiltroListaFidelidade> & { faixa: FaixaFidelidade }): string {
  const q = new URLSearchParams({ faixa: f.faixa });
  if (f.pop) q.set("unidade", String(f.pop));
  if (f.outros) q.set("outros", "1");
  else if (f.plano) q.set("plano", f.plano);
  return q.toString();
}

/**
 * Os grupos de plano de um filtro e quantos contratos o gráfico mostra para
 * ele (para conferir com a lista). familias null = todos os planos.
 */
export function familiasDoFiltro(
  f: FiltroListaFidelidade,
  resumo: ResumoFidelidade
): { familias: string[] | null; noGrafico: number; titulo: string } {
  const { principais, resto, total } = planosDoEscopo(resumo.unidades, f.pop, f.faixa);
  if (f.outros) {
    return {
      familias: resto.map(([p]) => p),
      noGrafico: resto.reduce((t, [, n]) => t + n, 0),
      titulo: `Outros ${resto.length} planos`,
    };
  }
  if (f.plano) {
    const n = [...principais, ...resto].find(([p]) => p === f.plano)?.[1] ?? 0;
    return { familias: [f.plano], noGrafico: n, titulo: f.plano };
  }
  return { familias: null, noGrafico: total, titulo: "Todos os planos" };
}
