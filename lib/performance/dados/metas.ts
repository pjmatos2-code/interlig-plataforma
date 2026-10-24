import "server-only";
import { ehVendaContavel, type ContratoIndicador } from "@/lib/indicadores/regras";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  avaliarMeta,
  contarDiasUteis,
  fimDoMes,
  janelaDaMeta,
  membroDaMeta,
  projetarFechamento,
  TIPOS_META,
  valorMetaParaComparar,
  type EscopoMeta,
  type Periodicidade,
  type SituacaoMeta,
  type TipoMeta,
} from "../regras/metas";
import { mediana } from "../regras/normalizacao";
import type { Apuracao } from "./apurar";
import type { VendedorBase } from "./base";
import { calcularLinha, indexar, type LinhaPerformance } from "./calcular";

/**
 * Metas da tela "Relatórios e metas" (PRD 16, 24/10/2026): meta mensal de
 * vendas (tabela metas, a mesma do dashboard e da comissão) e metas extras
 * (metas_performance), com realizado, cumprimento, projeção — sempre
 * ESTIMATIVA — e dias úteis restantes. Tudo sai da mesma base da apuração.
 */
const soma = (iso: string, d: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
const entre = (d: string | null | undefined, de: string, ate: string) => Boolean(d) && d!.slice(0, 10) >= de && d!.slice(0, 10) <= ate;

export type LinhaMetaMensal = {
  vendedor: VendedorBase;
  meta: number;
  realizado: number;
  pct: number | null;
  projecao: number | null;
  diasRestantes: number;
  necessarioPorDia: number | null;
  situacao: SituacaoMeta;
  afastadoNoMes: number;
};

export type GrupoMeta = { nome: string; meta: number; realizado: number; projecao: number | null; pct: number | null; situacao: SituacaoMeta; membros: number };

export type MetaExtra = {
  id: string;
  tipo: TipoMeta;
  escopo: EscopoMeta;
  aplicaA: string;
  periodicidade: Periodicidade;
  inicio: string;
  fim: string;
  valor: number;
  janela: { de: string; ate: string; fimCiclo: string; situacao: "vigente" | "futura" | "encerrada" };
  realizado: number | null;
  projecao: number | null;
  pct: number | null;
  situacao: SituacaoMeta;
  diasRestantes: number;
  parcial: boolean;
  membros: number;
};

export type HistoricoMeta = { meses: string[]; linhas: { vendedor: string; porMes: ({ meta: number; realizado: number } | null)[] }[] };

export type ApuracaoMetas = {
  referencia: string;
  mes: { de: string; ate: string; fim: string; diasUteis: number; diasRestantes: number; emAndamento: boolean };
  mensal: LinhaMetaMensal[];
  semMeta: VendedorBase[];
  equipes: GrupoMeta[];
  unidades: GrupoMeta[];
  total: GrupoMeta | null;
  extras: MetaExtra[];
  historico: HistoricoMeta;
};

export async function apurarMetas(ap: Apuracao, hoje: string): Promise<ApuracaoMetas> {
  const base = ap.base;
  const idx = indexar(base);
  const ref = ap.periodo.ate > hoje ? hoje : ap.periodo.ate;
  const mesIni = `${ref.slice(0, 7)}-01`;
  const mesFim = fimDoMes(ref);
  const emAndamento = ref === hoje;
  const ultimoEncerrado = emAndamento ? soma(ref, -1) : ref;
  const admin = criarClienteAdmin();
  const vendedores = ap.linhas.map((l) => l.vendedor);
  const ids = new Set(vendedores.map((v) => v.id));

  // afastamentos do mês inteiro (a base só traz até o fim do período)
  const inicioHist = (() => {
    const [a, m] = mesIni.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 - 6, 1));
    return d.toISOString().slice(0, 10);
  })();
  const [{ data: afast }, { data: metasHist }, { data: extrasBrutas }, { data: usuarios }, { data: pops }] = await Promise.all([
    admin.from("indisponibilidades_vendedor").select("vendedor_id, inicio, fim").lte("inicio", mesFim).gte("fim", mesIni).limit(2000),
    admin.from("metas").select("referencia_id, mes_ano, quantidade_vendas").eq("escopo", "vendedora").gte("mes_ano", inicioHist).lte("mes_ano", mesIni).limit(5000),
    admin.from("metas_performance").select("id, tipo, escopo, referencia, periodicidade, inicio, fim, valor").eq("ativo", true).gte("fim", soma(ref, -62)).order("inicio", { ascending: false }).limit(300),
    admin.from("usuarios").select("id, nome"),
    admin.from("pops").select("id, nome"),
  ]);
  const afastPorV = new Map<string, { inicio: string; fim: string }[]>();
  for (const a of afast ?? []) afastPorV.set(a.vendedor_id as string, [...(afastPorV.get(a.vendedor_id as string) ?? []), { inicio: a.inicio as string, fim: a.fim as string }]);
  const indisp = (vId: string) => (d: string) => (afastPorV.get(vId) ?? []).some((a) => d >= a.inicio && d <= a.fim);
  const util = base.ehDiaUtil;

  const vendasEntre = (vId: string, de: string, ate: string) =>
    de > ate ? 0 : (idx.contratosPorVendedor.get(vId) ?? []).filter((c) => entre(c.data_venda, de, ate) && ehVendaContavel(c as unknown as ContratoIndicador)).length;

  // ---------- meta mensal de vendas, por vendedor
  const metaDoMes = new Map<string, number>();
  for (const m of metasHist ?? []) if ((m.mes_ano as string).slice(0, 7) === mesIni.slice(0, 7)) metaDoMes.set(m.referencia_id as string, Number(m.quantidade_vendas));
  const mensal: LinhaMetaMensal[] = [];
  const semMeta: VendedorBase[] = [];
  // coordenador tem registro de vendedor com a meta DA COORDENAÇÃO (não vende):
  // fica fora da lista individual e das somas, senão a meta do time conta duas vezes
  const individuais = vendedores.filter((v) => !v.eh_coordenador);
  for (const v of individuais) {
    const meta = metaDoMes.get(v.id);
    if (!meta) {
      if (v.ativo) semMeta.push(v);
      continue;
    }
    const fora = indisp(v.id);
    const realizado = vendasEntre(v.id, mesIni, ref);
    const realizadoEncerrado = vendasEntre(v.id, mesIni, ultimoEncerrado);
    const diasEncerrados = contarDiasUteis(mesIni, ultimoEncerrado, util, fora);
    const diasRestantesDepois = contarDiasUteis(soma(ref, 1), mesFim, util, fora);
    const diasRestantes = diasRestantesDepois + (emAndamento && util(ref) && !fora(ref) ? 1 : 0);
    const projecao = projetarFechamento({ realizado, realizadoEncerrado, diasEncerrados, diasRestantesDepois });
    const av = avaliarMeta({ meta, realizado, projecao, aditiva: true, cicloEncerrado: ref >= mesFim && !emAndamento, diasRestantes });
    const afastadoNoMes = contarDiasUteis(mesIni, mesFim, util) - contarDiasUteis(mesIni, mesFim, util, fora);
    mensal.push({ vendedor: v, meta, realizado, projecao, diasRestantes, afastadoNoMes, ...av });
  }
  mensal.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));

  // grupos: só quem tem meta no mês entra no total do grupo (mesma regra do dashboard)
  const agrupar = (nome: string, ls: LinhaMetaMensal[]): GrupoMeta => {
    const meta = ls.reduce((s, l) => s + l.meta, 0);
    const realizado = ls.reduce((s, l) => s + l.realizado, 0);
    const projecao = ls.every((l) => l.projecao !== null) ? Math.round(ls.reduce((s, l) => s + (l.projecao ?? 0), 0) * 10) / 10 : null;
    const restantes = contarDiasUteis(emAndamento ? ref : soma(ref, 1), mesFim, util);
    const av = avaliarMeta({ meta, realizado, projecao, aditiva: true, cicloEncerrado: ref >= mesFim && !emAndamento, diasRestantes: restantes });
    return { nome, meta, realizado, projecao, pct: av.pct, situacao: av.situacao, membros: ls.length };
  };
  const porChave = (f: (l: LinhaMetaMensal) => string | null) => {
    const m = new Map<string, LinhaMetaMensal[]>();
    for (const l of mensal) {
      const k = f(l);
      if (k) m.set(k, [...(m.get(k) ?? []), l]);
    }
    return m;
  };
  const equipes = [...porChave((l) => l.vendedor.coordenador_nome ?? "Sem coordenador cadastrado").entries()]
    .map(([k, ls]) => agrupar(k, ls))
    .sort((a, b) => (a.nome.startsWith("Sem ") ? 1 : 0) - (b.nome.startsWith("Sem ") ? 1 : 0) || a.nome.localeCompare(b.nome));
  const unidades = [...porChave((l) => l.vendedor.pop_nome).entries()].map(([k, ls]) => agrupar(k, ls)).sort((a, b) => a.nome.localeCompare(b.nome));
  const total = mensal.length ? agrupar("Total do escopo", mensal) : null;

  // ---------- metas extras (metas_performance)
  const nomeUsuario = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  const nomePop = new Map((pops ?? []).map((p) => [p.id as string, p.nome as string]));
  const nomeVend = new Map(base.vendedores.map((v) => [v.id, v.nome]));
  const cacheLinhas = new Map<string, LinhaPerformance>();
  const linha = (v: VendedorBase, de: string, ate: string) => {
    const k = `${v.id}|${de}|${ate}`;
    if (!cacheLinhas.has(k)) cacheLinhas.set(k, calcularLinha(base, idx, v, de, ate));
    return cacheLinhas.get(k)!;
  };
  const valorDoTipo = (tipo: TipoMeta, ls: LinhaPerformance[]): number | null => {
    if (!ls.length) return null;
    const somar = (f: (l: LinhaPerformance) => number) => ls.reduce((s, l) => s + f(l), 0);
    const mediaDe = (xs: (number | null)[]) => {
      const ok = xs.filter((x): x is number => x !== null);
      return ok.length ? Math.round((ok.reduce((s, x) => s + x, 0) / ok.length) * 10) / 10 : null;
    };
    switch (tipo) {
      case "vendas":
        return somar((l) => l.numeros.vendas);
      case "ativacoes":
        return somar((l) => l.numeros.ativacoes);
      case "leads_trabalhados":
        return somar((l) => l.numeros.leadsTrabalhados);
      case "followups":
        return somar((l) => l.esforco.indicadores.followups_realizados?.valor ?? 0);
      case "receita_nova":
        return Math.round(somar((l) => l.numeros.receitaNova) * 100) / 100;
      case "conversao": {
        const num = somar((l) => l.resultado.indicadores.conversao?.numerador ?? 0);
        const den = somar((l) => l.resultado.indicadores.conversao?.denominador ?? 0);
        return den ? num / den : null;
      }
      case "ticket_medio": {
        const vendas = somar((l) => l.numeros.vendas);
        return vendas ? Math.round((somar((l) => l.numeros.receitaNova) / vendas) * 100) / 100 : null;
      }
      case "tempo_resposta": {
        const xs = ls.map((l) => l.esforco.indicadores.tempo_primeira_resposta?.valor ?? null).filter((x): x is number => x !== null);
        const m = mediana(xs);
        return m === null ? null : Math.round((m / 60) * 10) / 10;
      }
      case "qualidade_atendimento":
        return mediaDe(ls.map((l) => (l.qualidade.indicadores.qualidade_atendimento?.disponivel ? l.qualidade.indicadores.qualidade_atendimento.valor : null)));
      case "esforco":
        return mediaDe(ls.map((l) => l.esforco.score.valor));
      case "ipc":
        return mediaDe(ls.map((l) => l.ipc.valor));
    }
  };

  const extras: MetaExtra[] = [];
  for (const m of extrasBrutas ?? []) {
    const tipo = m.tipo as TipoMeta;
    const info = TIPOS_META[tipo];
    if (!info) continue;
    const esc = m.escopo as EscopoMeta;
    const referencia = (m.referencia as string | null) ?? null;
    // só os vendedores do escopo/filtro de quem consulta; alvo fora dele não aparece
    const todosDoAlvo = base.vendedores.filter((v) => (v.ativo || ids.has(v.id)) && membroDaMeta({ escopo: esc, referencia }, v) && base.cfg.setores.includes(v.setor ?? ""));
    const membros = todosDoAlvo.filter((v) => ids.has(v.id));
    if (esc !== "global" && !membros.length) continue;
    const janela = janelaDaMeta({ periodicidade: m.periodicidade as Periodicidade, inicio: m.inicio as string, fim: m.fim as string }, ref);
    const valorMeta = valorMetaParaComparar(tipo, Number(m.valor));
    const futura = janela.situacao === "futura";
    const realizado = futura ? null : valorDoTipo(tipo, membros.map((v) => linha(v, janela.de, janela.ate)));
    // ciclo ainda correndo: a referência está dentro dele (ou é hoje, último dia do ciclo)
    const emCurso = !futura && janela.ate === ref && (ref < janela.fimCiclo || emAndamento);
    let projecao: number | null = null;
    let diasRestantes = 0;
    if (!futura && info.aditiva && realizado !== null) {
      const ultimoEnc = emAndamento && janela.ate === ref ? soma(ref, -1) : janela.ate;
      const realizadoEncerrado = ultimoEnc < janela.de ? 0 : (valorDoTipo(tipo, membros.map((v) => linha(v, janela.de, ultimoEnc))) ?? 0);
      const diasEncerrados = contarDiasUteis(janela.de, ultimoEnc, util);
      const diasRestantesDepois = contarDiasUteis(soma(janela.ate, 1), janela.fimCiclo, util);
      diasRestantes = diasRestantesDepois + (emAndamento && janela.ate === ref && util(ref) ? 1 : 0);
      projecao = m.periodicidade === "dia" ? null : projetarFechamento({ realizado, realizadoEncerrado, diasEncerrados, diasRestantesDepois });
    }
    const av = avaliarMeta({
      meta: valorMeta,
      realizado,
      projecao,
      aditiva: info.aditiva,
      menorEhMelhor: info.menorEhMelhor,
      cicloEncerrado: !emCurso && !futura,
      futura,
      diasRestantes,
    });
    const aplicaA =
      esc === "global" ? "Todos" : esc === "unidade" ? (nomePop.get(referencia ?? "") ?? "Unidade") : esc === "equipe" ? `Equipe de ${nomeUsuario.get(referencia ?? "") ?? "coordenador"}` : esc === "funcao" ? (referencia === "comercial_externo" ? "Venda externa" : referencia === "comercial_interno" ? "Venda interna" : (referencia ?? "")) : (nomeVend.get(referencia ?? "") ?? "Vendedor");
    extras.push({
      id: m.id as string,
      tipo,
      escopo: esc,
      aplicaA,
      periodicidade: m.periodicidade as Periodicidade,
      inicio: m.inicio as string,
      fim: m.fim as string,
      valor: Number(m.valor),
      janela,
      realizado,
      projecao,
      pct: av.pct,
      situacao: av.situacao,
      diasRestantes,
      parcial: membros.length < todosDoAlvo.length,
      membros: membros.length,
    });
  }

  // ---------- histórico: meta × realizado dos 6 meses anteriores
  const meses: string[] = [];
  for (let i = 6; i >= 1; i--) {
    const [a, mm] = mesIni.split("-").map(Number);
    meses.push(new Date(Date.UTC(a, mm - 1 - i, 1)).toISOString().slice(0, 10));
  }
  const metaHist = new Map<string, number>();
  for (const m of metasHist ?? []) metaHist.set(`${m.referencia_id}|${(m.mes_ano as string).slice(0, 7)}`, Number(m.quantidade_vendas));
  // só os meses em que alguém do filtro tinha meta (a tabela metas começa em ago/2026)
  const mesesComMeta = meses.filter((mes) => individuais.some((v) => metaHist.has(`${v.id}|${mes.slice(0, 7)}`)));
  const historico: HistoricoMeta = {
    meses: mesesComMeta,
    linhas: individuais
      .map((v) => ({
        vendedor: v.nome,
        porMes: mesesComMeta.map((mes) => {
          const meta = metaHist.get(`${v.id}|${mes.slice(0, 7)}`);
          return meta ? { meta, realizado: vendasEntre(v.id, mes, fimDoMes(mes)) } : null;
        }),
      }))
      .filter((l) => l.porMes.some(Boolean))
      .sort((a, b) => a.vendedor.localeCompare(b.vendedor)),
  };

  return {
    referencia: ref,
    mes: { de: mesIni, ate: ref, fim: mesFim, diasUteis: contarDiasUteis(mesIni, mesFim, util), diasRestantes: contarDiasUteis(emAndamento ? ref : soma(ref, 1), mesFim, util), emAndamento },
    mensal,
    semMeta,
    equipes,
    unidades,
    total,
    extras,
    historico,
  };
}
