import type { CartaoOperacao } from "./dados";
import { diaSantarem, noPeriodo, servicoFeito, type BaseData, type Coluna, type TipoServico } from "./regras";

/**
 * Painel da Operação Técnica (redesign, 25/11/2026). Funções puras que contam
 * o que o quadro já classifica: nenhuma regra nova de status. "Falta validar"
 * é sempre a coluna `validar` (serviço feito com a OS ou a ocorrência aberta no
 * SGP), no cartão, no gráfico, no bloco de atenção, no quadro e na lista.
 */

export const UNIDADES_OPERACAO = ["Altamira", "Vitória do Xingu", "Brasil Novo"];
/** prazo já usado pelo GRR Técnico ("Falta validar há mais de 24 h") */
export const PRAZO_VALIDAR_H = 24;

export type ItemHistorico = {
  criadaEm: string;
  agendamento: string | null;
  /** quando o técnico fez o serviço; null enquanto não fez */
  feitoEm: string | null;
  encerrada: boolean;
  encerradaEm: string | null;
  unidade: string;
  tipo: TipoServico;
};

/** hora do serviço feito: o check-in do técnico; sem check-in, a baixa da OS (decisão de 21/11/2026) */
export function feitoEm(os: { status: string | null; checkin: string | null; encerrada_em: string | null; servico_prestado: string | null } | null | undefined): string | null {
  return servicoFeito(os) ? os!.checkin ?? os!.encerrada_em : null;
}

export type FiltrosOperacao = {
  unidade: string;
  tipos: TipoServico[];
  status: Coluna | "todos";
  responsavel: string;
  soCorporativo: boolean;
  busca: string;
  base: BaseData;
  intervalo: { de: string; ate: string };
  /** "Últimos 30 dias" por abertura mostra a janela inteira, sem cortar a borda */
  janelaInteira: boolean;
};

export const equipeDe = (c: Pick<CartaoOperacao, "tecnico" | "auxiliares">) => [c.tecnico, c.auxiliares].filter(Boolean).join(" + ");

/** período e unidade: os filtros que valem para tudo, inclusive os gráficos */
export function noRecorte(c: { criadaEm: string; agendamento: string | null; unidade: string }, f: Pick<FiltrosOperacao, "unidade" | "base" | "intervalo" | "janelaInteira">): boolean {
  return (f.unidade === "todas" || c.unidade === f.unidade) && ((f.janelaInteira && f.base === "abertura") || noPeriodo(c, f.base, f.intervalo));
}

export function filtrar(cartoes: CartaoOperacao[], f: FiltrosOperacao): CartaoOperacao[] {
  const q = f.busca.trim().toLowerCase();
  return cartoes.filter(
    (c) =>
      noRecorte(c, f) &&
      f.tipos.includes(c.tipo) &&
      (f.status === "todos" || c.coluna === f.status) &&
      (f.responsavel === "todos" || (f.responsavel === "sem" ? !c.tecnico : c.tecnico === f.responsavel)) &&
      (!f.soCorporativo || (c.corporativo && c.coluna !== "encerrada")) &&
      (!q || [c.cliente, c.bairro, c.tecnico, c.auxiliares, c.ocorrenciaId, c.osId, c.sgpContratoId].some((v) => (v ?? "").toLowerCase().includes(q)))
  );
}

export const emAberto = (c: { coluna: Coluna }) => c.coluna !== "encerrada";
/** desde quando espera a validação: a baixa da OS; sem baixa, o check-in (mesma conta do GRR Técnico) */
export const esperaDesde = (c: Pick<CartaoOperacao, "osEncerradaEm" | "checkin">) => c.osEncerradaEm ?? c.checkin;

export function contagens(cartoes: CartaoOperacao[]): Record<Coluna, number> & { corporativo: number; emAberto: number } {
  const n = { aberta: 0, agendada: 0, execucao: 0, validar: 0, encerrada: 0, corporativo: 0, emAberto: 0 };
  for (const c of cartoes) {
    n[c.coluna]++;
    if (emAberto(c)) {
      n.emAberto++;
      if (c.corporativo) n.corporativo++;
    }
  }
  return n;
}

export function porTipo(cartoes: CartaoOperacao[], tipos: TipoServico[]): { tipo: TipoServico; n: number; pct: number }[] {
  const abertos = cartoes.filter(emAberto);
  return tipos.map((tipo) => {
    const n = abertos.filter((c) => c.tipo === tipo).length;
    return { tipo, n, pct: abertos.length ? n / abertos.length : 0 };
  });
}

/** as três unidades sempre aparecem; outra unidade do SGP entra no fim */
export function porUnidade(cartoes: CartaoOperacao[], so: (c: CartaoOperacao) => boolean = emAberto): { unidade: string; n: number }[] {
  const m = new Map(UNIDADES_OPERACAO.map((u) => [u, 0]));
  for (const c of cartoes) if (so(c)) m.set(c.unidade, (m.get(c.unidade) ?? 0) + 1);
  return [...m].map(([unidade, n]) => ({ unidade, n }));
}

export type FilaValidar = { total: number; osEncerrada: number; osAberta: number; maisAntiga: CartaoOperacao | null; acimaDoPrazo: number; unidades: { unidade: string; n: number }[] };
export function filaValidar(cartoes: CartaoOperacao[], agora: number): FilaValidar {
  const fila = cartoes.filter((c) => c.coluna === "validar");
  let maisAntiga: CartaoOperacao | null = null;
  for (const c of fila) {
    const d = esperaDesde(c);
    if (d && (!maisAntiga || d < esperaDesde(maisAntiga)!)) maisAntiga = c;
  }
  const osEncerrada = fila.filter((c) => /encerrad/i.test(c.statusOs ?? "")).length;
  return {
    total: fila.length,
    osEncerrada,
    osAberta: fila.length - osEncerrada,
    maisAntiga,
    acimaDoPrazo: fila.filter((c) => {
      const d = esperaDesde(c);
      return d !== null && agora - Date.parse(d) > PRAZO_VALIDAR_H * 3_600_000;
    }).length,
    unidades: porUnidade(fila, () => true),
  };
}

export type PontoEvolucao = { dia: string; abertas: number; validar: number; encerradas: number };
const FIM = (dia: string) => Date.parse(`${dia}T23:59:59.999-03:00`);

/**
 * Evolução dia a dia das ocorrências do recorte, refeita pelas datas do SGP.
 * Abertas e Falta validar são ESTOQUE no fim do dia; Encerradas é FLUXO
 * acumulado desde o começo do período. Encerrada sem data no SGP não tem como
 * entrar num dia: fica fora das três séries (devolvida em `semData`).
 */
export function evolucao(itens: ItemHistorico[], f: Pick<FiltrosOperacao, "unidade" | "tipos" | "base" | "intervalo" | "janelaInteira">, agora: number): { pontos: PontoEvolucao[]; semData: number } {
  const hoje = diaSantarem(agora)!;
  const ate = f.intervalo.ate < hoje ? f.intervalo.ate : hoje;
  const sel = itens.filter((x) => noRecorte(x, f) && f.tipos.includes(x.tipo));
  const uteis = sel.filter((x) => !x.encerrada || x.encerradaEm);
  const pontos: PontoEvolucao[] = [];
  for (let t = Date.parse(`${f.intervalo.de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`) && pontos.length < 62; t += 86_400_000) {
    const dia = new Date(t).toISOString().slice(0, 10);
    const lim = Math.min(FIM(dia), agora);
    const p = { dia, abertas: 0, validar: 0, encerradas: 0 };
    for (const x of uteis) {
      if (Date.parse(x.criadaEm) > lim) continue;
      const fechada = x.encerrada && Date.parse(x.encerradaEm!) <= lim;
      if (fechada) {
        if (diaSantarem(x.encerradaEm)! >= f.intervalo.de) p.encerradas++;
        continue;
      }
      p.abertas++;
      // serviço feito antes da abertura registrada ou depois da baixa não vira espera
      if (x.feitoEm && Date.parse(x.feitoEm) <= lim) p.validar++;
    }
    pontos.push(p);
  }
  return { pontos, semData: sel.length - uteis.length };
}

/** movimento da fila nos últimos 7 dias: quantas entraram e quantas saíram validadas */
export function movimentoValidar(itens: ItemHistorico[], f: Parameters<typeof evolucao>[1], agora: number): { entraram: number; sairam: number } {
  const ini = agora - 7 * 86_400_000;
  const sel = itens.filter((x) => noRecorte(x, f) && f.tipos.includes(x.tipo) && x.feitoEm && (!x.encerrada || x.encerradaEm));
  return {
    entraram: sel.filter((x) => Date.parse(x.feitoEm!) >= ini).length,
    sairam: sel.filter((x) => x.encerrada && Date.parse(x.encerradaEm!) >= ini).length,
  };
}

export type Ordem = "padrao" | "espera";
/** instante de referência da espera no estado atual do cartão */
export function referencia(c: CartaoOperacao): string {
  if (c.coluna === "validar") return esperaDesde(c) ?? c.criadaEm;
  if (c.coluna === "execucao") return c.checkin ?? c.criadaEm;
  return c.criadaEm;
}
export function ordenar(cartoes: CartaoOperacao[], ordem: Ordem): CartaoOperacao[] {
  if (ordem === "padrao") return cartoes;
  return [...cartoes].sort((a, b) => (a.coluna === "encerrada" && b.coluna === "encerrada" ? (b.encerradaEm ?? "").localeCompare(a.encerradaEm ?? "") : Date.parse(referencia(a)) - Date.parse(referencia(b))));
}
