import { farolProjecao, mediaUltimosNDiasUteis, projecaoFechamento, receitaContratada, vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import { fimDoMes } from "@/lib/relatorio-semanal/periodo";
import { agentesDeVenda, type VendedorGrr } from "./escopo";
import { metaDoEscopo, type MetaLinha } from "./regras";

/**
 * Panorama do mês para a reunião de resultados da diretoria (função pura):
 * quanto a empresa, cada unidade e cada agente devem fechar no mês, como isso
 * se compara com os seis meses fechados anteriores e onde está o risco.
 * Nenhuma fórmula nova: venda (5.1), ticket (5.3), projeção (5.6), farol e
 * meta por recorte são as mesmas do Dashboard.
 */

export const MESES_HISTORICO = 6;
/** queda que acende atenção e que acende crítico, contra a média dos 6 meses */
const QUEDA_VENDAS = { atencao: 0.1, critico: 0.25 };
const QUEDA_TICKET = 0.05;
/** vendas do mês abaixo disso não sustentam comparação de ticket */
const MINIMO_TICKET = 5;
const DIAS_SEM_VENDA = 3;

export type ContratoPanorama = ContratoIndicador & { vendedor_id: string | null; pop_id: string | null; fora: string | null };

export type MesSerie = { mes: string; vendas: number; ticket: number | null; diasUteis: number; porDia: number };
export type LinhaPanorama = {
  id: string;
  nome: string;
  unidade: string | null;
  /** os 6 meses fechados, do mais antigo ao mais recente; vendas null = antes da primeira venda registrada */
  serie: (Omit<MesSerie, "vendas"> & { vendas: number | null })[];
  mesesComparados: number;
  mediaVendas: number | null;
  mediaPorDia: number | null;
  /** mediana do ticket dos meses comparados (meses com 5 vendas ou mais) */
  mediaTicket: number | null;
  vendas: number;
  receita: number;
  ticket: number | null;
  porDia: number;
  /** média por dia útil dos últimos 7 dias úteis */
  porDia7: number;
  /** null enquanto o mês ainda não tem dia útil decorrido */
  projecao: number;
  meta: number | null;
  /** projeção ÷ meta */
  atingimento: number | null;
  farol: "verde" | "amarelo" | "vermelho" | "sem_meta";
  /** vendas que faltam para a meta, hoje */
  falta: number | null;
  /** vendas por dia útil que faltam fazer, contando hoje */
  precisaPorDia: number | null;
  /** projeção contra a média dos 6 meses */
  variacao: number | null;
  variacaoTicket: number | null;
  /** quantos meses seguidos caindo, com a projeção do mês atual */
  quedasSeguidas: number;
  /** dias úteis seguidos sem venda até ontem (ou até o fim do mês fechado) */
  diasSemVenda: number;
  /** vendas do mês sem agente identificado e a projeção sem elas (empresa e unidades) */
  semAgente: number;
  projecaoSemAgente: number;
  ticketSemAgente: number | null;
};
export type PontoAtencao = { nivel: "critico" | "atencao"; alvo: "empresa" | "unidade" | "agente"; nome: string; motivos: string[]; ordem: number };
export type Panorama = {
  mes: string;
  corte: string;
  fechado: boolean;
  diasUteis: { total: number; decorridos: number; restantes: number };
  mesesHistorico: string[];
  empresa: LinhaPanorama;
  unidades: LinhaPanorama[];
  agentes: LinhaPanorama[];
  /** vendas do mês e do histórico que não são dos agentes listados (sem agente, coordenação, quem saiu) */
  outros: { vendas: number; serie: number[] };
  pontos: PontoAtencao[];
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
const n1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const p0 = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const r2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const mediana = (v: number[]): number | null => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export function mesesAnteriores(mes: string, n: number): string[] {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1 - (n - i), 1)).toISOString().slice(0, 7));
}

export function montarPanorama(e: {
  /** mês analisado (aaaa-mm) e último dia que entra na conta */
  mes: string;
  hoje: string;
  contratos: ContratoPanorama[];
  metas: MetaLinha[];
  vendedores: VendedorGrr[];
  pops: { id: string; nome: string }[];
  ehUtil: (dia: string) => boolean;
  /** recorte de unidade da reunião (null = empresa) */
  popId: string | null;
}): Panorama {
  const de = `${e.mes}-01`;
  const ate = fimDoMes(de);
  const fechado = ate < e.hoje;
  const corte = fechado ? ate : e.hoje;
  const contratos = e.contratos.filter((c) => !c.fora && (!e.popId || c.pop_id === e.popId));
  const meses = mesesAnteriores(e.mes, MESES_HISTORICO);
  const uteisDe = (mes: string) => {
    const fim = Number(fimDoMes(`${mes}-01`).slice(8, 10));
    return Array.from({ length: fim }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`).filter(e.ehUtil);
  };
  const uteis = uteisDe(e.mes);
  const decorridos = uteis.filter((d) => d <= corte);
  const aposHoje = fechado ? 0 : uteis.filter((d) => d > corte).length;
  const restantes = fechado ? 0 : uteis.filter((d) => d >= corte).length;
  const uteisMeses = new Map(meses.map((m) => [m, uteisDe(m).length]));

  const projetar = (doMes: ContratoPanorama[]) => {
    const porDiaMapa = new Map<string, number>();
    for (const c of doMes) porDiaMapa.set(c.data_venda, (porDiaMapa.get(c.data_venda) ?? 0) + 1);
    const media7 = mediaUltimosNDiasUteis(porDiaMapa, decorridos, 7);
    const mediaMes = decorridos.length ? doMes.length / decorridos.length : 0;
    return { porDiaMapa, media7, mediaMes, projecao: projecaoFechamento({ acumuladoMes: doMes.length, mediaUltimos7DiasUteis: media7, mediaDiariaMes: mediaMes, diasUteisRestantes: aposHoje }) };
  };

  const linha = (base: { id: string; nome: string; unidade: string | null }, seus: ContratoPanorama[], meta: number | null, desdeAPrimeira: boolean): LinhaPanorama => {
    const primeira = seus.map((c) => c.data_venda.slice(0, 7)).sort()[0] ?? null;
    const serie = meses.map((mes) => {
      const v = vendasDoPeriodo(seus, `${mes}-01`, fimDoMes(`${mes}-01`));
      const du = uteisMeses.get(mes) ?? 0;
      const antes = desdeAPrimeira && (primeira === null || mes < primeira);
      return { mes, vendas: antes ? null : v.length, receita: receitaContratada(v), ticket: v.length ? receitaContratada(v) / v.length : null, diasUteis: du, porDia: du ? v.length / du : 0 };
    });
    const validos = serie.filter((s) => s.vendas !== null);
    const somaV = validos.reduce((s, x) => s + (x.vendas ?? 0), 0);
    const somaDu = validos.reduce((s, x) => s + x.diasUteis, 0);
    const doMes = vendasDoPeriodo(seus, de, corte);
    const receita = receitaContratada(doMes);
    const { porDiaMapa, media7, mediaMes, projecao } = projetar(doMes);
    const comAgente = doMes.filter((c) => c.vendedor_id);
    const mediaVendas = validos.length ? somaV / validos.length : null;
    // mês típico (mediana): um contrato grande num mês só não vira a régua dos outros
    const mediaTicket = mediana(validos.filter((s) => (s.vendas ?? 0) >= MINIMO_TICKET).map((s) => s.ticket!));
    const ticket = doMes.length ? receita / doMes.length : null;
    const falta = meta ? Math.max(0, meta - doMes.length) : null;

    // compara a projeção arredondada, que é o número mostrado na tela
    const seq = [...validos.map((s) => s.vendas!), Math.round(projecao)];
    let quedas = 0;
    for (let i = seq.length - 1; i > 0 && seq[i] < seq[i - 1]; i--) quedas++;
    // hoje ainda está em andamento: sem venda conta até ontem
    const conferir = fechado ? decorridos : decorridos.filter((d) => d < corte || porDiaMapa.has(d));
    let diasSemVenda = 0;
    for (let i = conferir.length - 1; i >= 0 && !porDiaMapa.has(conferir[i]); i--) diasSemVenda++;

    return {
      ...base,
      serie: serie.map(({ receita: _r, ...s }) => (void _r, s)),
      mesesComparados: validos.length,
      mediaVendas,
      mediaPorDia: somaDu ? somaV / somaDu : null,
      mediaTicket,
      vendas: doMes.length,
      receita,
      ticket,
      porDia: mediaMes,
      porDia7: media7,
      projecao,
      meta,
      atingimento: meta ? projecao / meta : null,
      farol: meta ? farolProjecao(projecao, meta) : "sem_meta",
      falta,
      precisaPorDia: falta === null ? null : falta === 0 || !restantes ? 0 : falta / restantes,
      variacao: mediaVendas ? projecao / mediaVendas - 1 : null,
      variacaoTicket: mediaTicket && ticket !== null && doMes.length >= MINIMO_TICKET ? ticket / mediaTicket - 1 : null,
      quedasSeguidas: quedas,
      diasSemVenda,
      semAgente: doMes.length - comAgente.length,
      projecaoSemAgente: projetar(comAgente).projecao,
      ticketSemAgente: comAgente.length ? receitaContratada(comAgente) / comAgente.length : null,
    };
  };

  const nomePop = new Map(e.pops.map((p) => [p.id, p.nome]));
  const meta = (popId: string | null, vendedorIds: string[] | null) => metaDoEscopo(e.metas, e.vendedores, e.pops, { popId, vendedorIds });
  const empresa = linha({ id: "empresa", nome: e.popId ? nomePop.get(e.popId) ?? "Unidade" : "Empresa", unidade: null }, contratos, meta(e.popId, null), false);
  const ordem = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
  const posicao = (n: string) => (ordem.includes(n) ? ordem.indexOf(n) : ordem.length);
  const unidades = e.pops
    .filter((p) => !e.popId || p.id === e.popId)
    .sort((a, b) => posicao(a.nome) - posicao(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => linha({ id: p.id, nome: p.nome, unidade: p.nome }, contratos.filter((c) => c.pop_id === p.id), meta(p.id, null), false));

  // a venda do agente conta em qualquer cidade; a lista segue o recorte da reunião
  const todos = e.contratos.filter((c) => !c.fora);
  const ativos = agentesDeVenda(e.vendedores).filter((v) => !e.popId || v.pop_id === e.popId);
  const agentes = ativos
    .map((v) => linha({ id: v.id, nome: v.nome, unidade: v.pop_id ? nomePop.get(v.pop_id) ?? null : null }, todos.filter((c) => c.vendedor_id === v.id), meta(null, [v.id]), true))
    // cadastro ativo sem meta e sem venda no mês não é agente em atividade (login de loja, por exemplo)
    .filter((l) => l.meta || l.vendas > 0)
    .sort((a, b) => posicao(a.unidade ?? "") - posicao(b.unidade ?? "") || b.vendas - a.vendas || a.nome.localeCompare(b.nome, "pt-BR"));

  const listados = new Set(agentes.map((a) => a.id));
  const resto = contratos.filter((c) => !c.vendedor_id || !listados.has(c.vendedor_id));
  const outros = { vendas: vendasDoPeriodo(resto, de, corte).length, serie: meses.map((m) => vendasDoPeriodo(resto, `${m}-01`, fimDoMes(`${m}-01`)).length) };

  const p: Panorama = { mes: e.mes, corte, fechado, diasUteis: { total: uteis.length, decorridos: decorridos.length, restantes }, mesesHistorico: meses, empresa, unidades, agentes, outros, pontos: [] };
  p.pontos = pontosDeAtencao(p);
  return p;
}

/** por que a linha preocupa (vazio: não preocupa) */
export function motivosDaLinha(l: LinhaPanorama, p: Pick<Panorama, "fechado" | "diasUteis">): { nivel: PontoAtencao["nivel"]; motivos: string[] } | null {
  const motivos: string[] = [];
  let critico = false;
  if (l.meta) {
    if (l.atingimento! < 1) {
      critico ||= l.farol === "vermelho";
      motivos.push(
        p.fechado
          ? `fechou em ${l.vendas} de ${l.meta} (${p0(l.atingimento!)} da meta)`
          : `${Math.round(l.projecao) >= l.meta ? "no limite da meta: projeção" : "projeção"} de ${Math.round(l.projecao)} para ${l.meta} (${p0(l.atingimento!)}). Faltam ${l.falta}: precisa de ${n1(l.precisaPorDia!)} por dia útil e vem fazendo ${n1(l.porDia7)} (últimos 7 dias úteis)`
      );
    }
  } else motivos.push("sem meta cadastrada no mês");
  if (l.variacao !== null && l.mesesComparados >= 2 && l.variacao <= -QUEDA_VENDAS.atencao) {
    critico ||= l.variacao <= -QUEDA_VENDAS.critico;
    motivos.push(`produtividade ${p0(l.variacao)} abaixo da média de ${l.mesesComparados} meses (deve fechar em ${Math.round(l.projecao)}; a média é ${n1(l.mediaVendas!)} por mês)`);
  }
  if (l.quedasSeguidas >= 3) motivos.push(`${l.quedasSeguidas} meses seguidos em queda`);
  if (l.variacaoTicket !== null && l.variacaoTicket <= -QUEDA_TICKET) motivos.push(`ticket médio ${p0(l.variacaoTicket)} abaixo do mês típico (${r2(l.ticket!)} contra ${r2(l.mediaTicket!)})`);
  // só para quem vende em ritmo diário: menos de uma venda a cada dois dias úteis é normal ficar dias sem vender
  if (!p.fechado && l.diasSemVenda >= DIAS_SEM_VENDA && (l.mediaPorDia ?? 0) >= 0.5) motivos.push(`${l.diasSemVenda} dias úteis seguidos sem venda`);
  return motivos.length ? { nivel: critico ? "critico" : "atencao", motivos } : null;
}

export function pontosDeAtencao(p: Omit<Panorama, "pontos">): PontoAtencao[] {
  const de = (alvo: PontoAtencao["alvo"], l: LinhaPanorama): PontoAtencao[] => {
    const m = motivosDaLinha(l, p);
    return m ? [{ nivel: m.nivel, alvo, nome: l.nome, motivos: m.motivos, ordem: l.atingimento ?? 2 }] : [];
  };
  const peso = { critico: 0, atencao: 1 } as const;
  const lista = [
    ...(p.unidades.length > 1 ? de("empresa", p.empresa) : []),
    ...[...p.unidades.flatMap((u) => de("unidade", u)), ...p.agentes.flatMap((a) => de("agente", a))].sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR")),
  ];
  const { semAgente, projecaoSemAgente, projecao } = p.empresa;
  if (semAgente > 0)
    lista.push({
      nivel: "atencao",
      alvo: "empresa",
      nome: "Vendas sem agente",
      motivos: [`${semAgente} ${semAgente === 1 ? "venda do mês está sem agente: conta" : "vendas do mês estão sem agente: contam"} na unidade e não ${semAgente === 1 ? "entra" : "entram"} no resultado de ninguém. Sem ${semAgente === 1 ? "ela" : "elas"}, a projeção cai de ${Math.round(projecao)} para ${Math.round(projecaoSemAgente)}`],
      ordem: 3,
    });
  return lista;
}
