import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { refidelizacaoDoMes, type AditivoLinha } from "@/lib/refidelizacao/dados";
import { FAIXAS_REFIDELIZACAO, META_REFIDELIZACAO, faixaDe } from "@/lib/refidelizacao/regras";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";

/**
 * Meu painel do Atendimento (refidelização) — layout aprovado em 01/10/2026,
 * mesmo modelo do comercial. Números do MESMO motor de "Minha comissão" e do
 * fechamento (refidelizacaoDoMes): meta 150, faixas 80/101/121/167%.
 */

export type PainelAtendimento = {
  nome: string;
  foto: string | null;
  meta: number;
  faixas: typeof FAIXAS_REFIDELIZACAO;
  gerados: number;
  assinados: number;
  reprovados: number;
  validos: number;
  /** aguardando assinatura do cliente/provedor (vão contar quando assinarem) */
  aguardando: AditivoLinha[];
  aguardandoParados: number;
  /** venda nova: só conta com aprovação da gestão */
  emAnalise: AditivoLinha[];
  atingimento: number;
  faixa: (typeof FAIXAS_REFIDELIZACAO)[number] | null;
  proximo: { faltam: number; faixa: (typeof FAIXAS_REFIDELIZACAO)[number] } | null;
  vtv: number;
  comissao: number;
  comissaoSeAssinarem: number;
  vtvMedio: number;
  hoje: { hoje: number; anterior: number; diaAnterior: string | null; metaDia: number | null };
  dias: { data: string; validos: number; util: boolean; futuro: boolean }[];
  metaDiaMes: number | null;
  planos: { plano: string; quantidade: number }[];
  linhas: AditivoLinha[];
};

/** menor quantidade de válidos que alcança a faixa (o motor arredonda o %) */
function planosParaFaixa(min: number): number {
  let n = Math.max(0, Math.floor((min / 100) * META_REFIDELIZACAO) - 1);
  while (Math.round((n / META_REFIDELIZACAO) * 100) < min) n++;
  return n;
}

export async function carregarPainelAtendimento(vendedorId: string, mesIso: string): Promise<PainelAtendimento | null> {
  const admin = criarClienteAdmin();
  const hoje = hojeIso();
  const mes = primeiroDiaDoMes(mesIso);
  const { data: v } = await admin.from("vendedores").select("nome, foto_url, sgp_login").eq("id", vendedorId).maybeSingle();
  const login = (v?.sgp_login as string | null)?.toLowerCase();
  if (!v || !login) return null;

  const [refi, { data: cal }, { data: anteriores }] = await Promise.all([
    refidelizacaoDoMes(mes, [login]),
    admin.from("calendario").select("data, dia_util").gte("data", mes).lte("data", ultimoDiaDoMes(mes)).order("data"),
    admin.from("calendario").select("data").lt("data", hoje).eq("dia_util", true).order("data", { ascending: false }).limit(1),
  ]);
  const r = refi.agentes[0];
  const linhas = r?.linhas ?? [];
  const validas = linhas.filter((l) => l.conta);
  const aguardando = linhas.filter((l) => !l.conta && l.decisao !== "reprovado" && !l.vendaRecente);
  const emAnalise = linhas.filter((l) => !l.conta && l.decisao === null && l.vendaRecente);
  const limiteParado = new Date(Date.parse(`${hoje}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10);

  const vtv = r?.vtv ?? 0;
  const atingimento = (validas.length / META_REFIDELIZACAO) * 100;
  const faixa = faixaDe(atingimento);
  const acima = FAIXAS_REFIDELIZACAO.find((f) => Math.round(atingimento) < f.min) ?? null;
  const vtvSe = vtv + aguardando.reduce((s, l) => s + l.valorMensal, 0);
  const faixaSe = faixaDe(((validas.length + aguardando.length) / META_REFIDELIZACAO) * 100);

  const diasCal = (cal ?? []) as { data: string; dia_util: boolean }[];
  const uteis = diasCal.filter((d) => d.dia_util).length;
  const porDia = new Map<string, number>();
  for (const l of validas) porDia.set(l.data, (porDia.get(l.data) ?? 0) + 1);
  const diaAnterior = (anteriores?.[0]?.data as string | undefined) ?? null;
  // "hoje" e o dia útil anterior independem do mês exibido (1º do mês: o
  // anterior está no mês passado)
  const mesHoje = primeiroDiaDoMes(hoje);
  const doMes = new Map<string, AditivoLinha[]>([[mes, linhas]]);
  for (const m of new Set([mesHoje, diaAnterior ? primeiroDiaDoMes(diaAnterior) : mesHoje])) {
    if (!doMes.has(m)) doMes.set(m, (await refidelizacaoDoMes(m, [login])).agentes[0]?.linhas ?? []);
  }
  const validosEm = (dia: string) => (doMes.get(primeiroDiaDoMes(dia)) ?? []).filter((l) => l.conta && l.data === dia).length;

  const porPlano = new Map<string, number>();
  for (const l of validas) {
    const p = (l.plano ?? "Outros").replace(/^PL-/i, "").toUpperCase();
    porPlano.set(p, (porPlano.get(p) ?? 0) + 1);
  }
  const ordenado = [...porPlano.entries()].sort((a, b) => b[1] - a[1]);
  const planos = ordenado.slice(0, 5).map(([plano, quantidade]) => ({ plano, quantidade }));
  const resto = ordenado.slice(5).reduce((s, [, n]) => s + n, 0);
  if (resto > 0) planos.push({ plano: "Outros", quantidade: resto });

  return {
    nome: v.nome as string,
    foto: (v.foto_url as string | null) ?? null,
    meta: META_REFIDELIZACAO,
    faixas: FAIXAS_REFIDELIZACAO,
    gerados: linhas.length,
    assinados: linhas.filter((l) => l.assinado).length,
    reprovados: linhas.filter((l) => l.decisao === "reprovado").length,
    validos: validas.length,
    aguardando,
    aguardandoParados: aguardando.filter((l) => l.data <= limiteParado).length,
    emAnalise,
    atingimento,
    faixa,
    proximo: acima ? { faltam: Math.max(1, planosParaFaixa(acima.min) - validas.length), faixa: acima } : null,
    vtv,
    comissao: r?.comissao ?? 0,
    comissaoSeAssinarem: faixaSe ? (vtvSe * faixaSe.pct) / 100 : 0,
    vtvMedio: validas.length ? vtv / validas.length : 0,
    hoje: {
      hoje: validosEm(hoje),
      anterior: diaAnterior ? validosEm(diaAnterior) : 0,
      diaAnterior,
      metaDia: mes === mesHoje && uteis > 0 ? META_REFIDELIZACAO / uteis : null,
    },
    dias: diasCal.map((d) => ({ data: d.data, validos: porDia.get(d.data) ?? 0, util: d.dia_util, futuro: d.data > hoje })),
    metaDiaMes: uteis > 0 ? META_REFIDELIZACAO / uteis : null,
    planos,
    linhas,
  };
}
