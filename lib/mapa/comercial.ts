import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import type { Periodo } from "@/lib/datas";

/**
 * Mapa comercial (15/10/2026) — mancha de calor com a coordenada de cada
 * cliente (cadastro do SGP) no lugar das bolas por centro de bairro. Os
 * limites dos bairros são APROXIMADOS: o contorno das casas dos clientes de
 * cada bairro (não há mapa oficial de bairros). Potencial do bairro (imóveis
 * atendíveis) fica para a fase 2.
 */

export type Ponto = [number, number];

export type BairroMapa = {
  chave: string;
  nome: string;
  cidade: string;
  contorno: Ponto[];
  centro: Ponto;
  ativos: number;
  suspensos: number;
  instalacoes: number;
  vendas: number;
  cancelamentos: number;
  semLocalizacao: number;
};

export type MapaComercial = {
  instalacoes: Ponto[];
  base: Ponto[];
  bairros: BairroMapa[];
  centro: Ponto;
  cobertura: { ativos: number; comLocalizacao: number };
};

const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(BAIRRO|BAIRO) /, ""); // "BAIRRO CENTRO" = "CENTRO"

/** fecho convexo (cadeia monótona) — contorno aproximado do bairro */
function contornoConvexo(pts: Ponto[]): Ponto[] {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (p.length < 3) return p;
  const cruz = (o: Ponto, a: Ponto, b: Ponto) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const baixo: Ponto[] = [];
  for (const x of p) {
    while (baixo.length >= 2 && cruz(baixo[baixo.length - 2], baixo[baixo.length - 1], x) <= 0) baixo.pop();
    baixo.push(x);
  }
  const cima: Ponto[] = [];
  for (const x of [...p].reverse()) {
    while (cima.length >= 2 && cruz(cima[cima.length - 2], cima[cima.length - 1], x) <= 0) cima.pop();
    cima.push(x);
  }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)];
}

const mediana = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** distância aproximada em metros (latitudes baixas: aproximação plana basta) */
const metros = (a: Ponto, b: Ponto) => Math.hypot((a[0] - b[0]) * 111_000, (a[1] - b[1]) * 111_000 * Math.cos((a[0] * Math.PI) / 180));

export async function carregarMapaComercial(periodo: Periodo, popId: string | null): Promise<MapaComercial> {
  const admin = criarClienteAdmin();
  type Linha = {
    sgp_contrato_id: string;
    status: string;
    data_venda: string;
    data_ativacao: string | null;
    data_cancelamento: string | null;
    pop_id: string | null;
    clientes: { bairro: string | null; cidade: string | null; lat: number | null; lng: number | null } | null;
  };
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    let q = admin
      .from("contratos")
      .select("sgp_contrato_id, status, data_venda, data_ativacao, data_cancelamento, pop_id, clientes(bairro, cidade, lat, lng)")
      .or(
        `status.in.(ativo,suspenso),and(data_ativacao.gte.${periodo.de},data_ativacao.lte.${periodo.ate}),and(data_venda.gte.${periodo.de},data_venda.lte.${periodo.ate}),and(data_cancelamento.gte.${periodo.de},data_cancelamento.lte.${periodo.ate})`
      )
      .order("id")
      .range(de, de + 999);
    if (popId) q = q.eq("pop_id", popId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as unknown as Linha[]));
    if (!data || data.length < 1000) break;
  }

  const noPeriodo = (d: string | null) => !!d && d >= periodo.de && d <= periodo.ate;
  const coord = (l: Linha): Ponto | null =>
    l.clientes?.lat != null && l.clientes?.lng != null ? [Number(l.clientes.lat), Number(l.clientes.lng)] : null;

  const instalacoes: Ponto[] = [];
  const base: Ponto[] = [];
  type Acc = Omit<BairroMapa, "contorno" | "centro" | "nome"> & { nomes: Map<string, number>; pontos: Ponto[] };
  const porBairro = new Map<string, Acc>();
  let ativosTotal = 0;
  let ativosCom = 0;

  for (const l of linhas) {
    const p = coord(l);
    const ativo = l.status === "ativo";
    if (ativo) {
      ativosTotal++;
      if (p) {
        ativosCom++;
        base.push(p);
      }
    }
    if (p && noPeriodo(l.data_ativacao)) instalacoes.push(p);

    const bruto = (l.clientes?.bairro ?? "").trim();
    const cidade = l.clientes?.cidade ?? "";
    if (!bruto || !cidade) continue;
    const chave = `${cidade}|${normalizar(bruto)}`;
    const a =
      porBairro.get(chave) ??
      ({ chave, cidade, ativos: 0, suspensos: 0, instalacoes: 0, vendas: 0, cancelamentos: 0, semLocalizacao: 0, nomes: new Map(), pontos: [] } as Acc);
    a.nomes.set(bruto, (a.nomes.get(bruto) ?? 0) + 1);
    if (ativo) {
      a.ativos++;
      if (p) a.pontos.push(p);
      else a.semLocalizacao++;
    }
    if (l.status === "suspenso") a.suspensos++;
    if (noPeriodo(l.data_ativacao)) a.instalacoes++;
    if (noPeriodo(l.data_venda)) a.vendas++;
    if (l.status === "cancelado" && noPeriodo(l.data_cancelamento)) a.cancelamentos++;
    porBairro.set(chave, a);
  }

  const bairros: BairroMapa[] = [];
  for (const a of porBairro.values()) {
    const nome = [...a.nomes.entries()].sort((x, y) => y[1] - x[1])[0][0].replace(/^bairro /i, "");
    let contorno: Ponto[] = [];
    let centro: Ponto | null = null;
    if (a.pontos.length >= 15) {
      // casas longe demais do miolo do bairro são endereço digitado errado
      const c: Ponto = [mediana(a.pontos.map((p) => p[0])), mediana(a.pontos.map((p) => p[1]))];
      const dist = a.pontos.map((p) => metros(p, c));
      // e bairro informado errado no cadastro — ficam fora do contorno
      const lim = Math.max(150, mediana(dist) * 1.8);
      const bons = a.pontos.filter((_, i) => dist[i] <= lim);
      contorno = bons.length >= 3 ? contornoConvexo(bons) : [];
      centro = c;
    } else if (a.pontos.length > 0) {
      centro = [mediana(a.pontos.map((p) => p[0])), mediana(a.pontos.map((p) => p[1]))];
    }
    if (!centro) continue;
    const { nomes: _n, pontos: _p, ...resto } = a;
    bairros.push({ ...resto, nome, contorno, centro });
  }
  bairros.sort((x, y) => y.ativos - x.ativos);

  const todos = base.length ? base : instalacoes;
  const centro: Ponto = todos.length
    ? [mediana(todos.map((p) => p[0])), mediana(todos.map((p) => p[1]))]
    : [-3.2042, -52.21]; // Altamira

  return { instalacoes, base, bairros, centro, cobertura: { ativos: ativosTotal, comLocalizacao: ativosCom } };
}
