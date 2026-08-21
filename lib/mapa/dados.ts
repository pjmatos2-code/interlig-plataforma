import { criarClienteServidor } from "@/lib/supabase/server";
import { vendasDoPeriodo, type ContratoIndicador } from "@/lib/indicadores/regras";
import type { Periodo } from "@/lib/datas";

export type PontoBairro = {
  cidade: string;
  bairro: string;
  lat: number;
  lng: number;
  vendasPeriodo: number;
  clientesAtivos: number;
  receitaPeriodo: number;
};

type ContratoM = ContratoIndicador & {
  pop_id: string | null;
  clientes: { bairro: string | null; cidade: string | null } | null;
};

/**
 * Mapa de calor por bairro (PRD 3.6) — MVP com agregação por centroide do
 * bairro (bairros_geo), nunca geocodificando em tempo de renderização.
 * Camadas: vendas do período e clientes ativos.
 */
export async function carregarMapa(
  periodo: Periodo,
  popId: string | null
): Promise<{ pontos: PontoBairro[]; centro: [number, number] }> {
  const supabase = criarClienteServidor();

  let consulta = supabase
    .from("contratos")
    .select(
      "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade, pop_id, clientes(bairro, cidade)"
    )
    .or(`and(data_venda.gte.${periodo.de},data_venda.lte.${periodo.ate}),status.eq.ativo`)
    .limit(8000);
  if (popId) consulta = consulta.eq("pop_id", popId);

  const [{ data: contratosBrutos }, { data: bairros }] = await Promise.all([
    consulta,
    supabase.from("bairros_geo").select("cidade, bairro, lat_centroide, lng_centroide"),
  ]);

  const contratos = (contratosBrutos ?? []) as unknown as ContratoM[];
  const centroide = new Map(
    (bairros ?? []).map((b) => [
      `${b.cidade}|${b.bairro}`,
      [b.lat_centroide as number, b.lng_centroide as number] as [number, number],
    ])
  );

  const porBairro = new Map<
    string,
    { vendasPeriodo: number; clientesAtivos: number; receitaPeriodo: number }
  >();
  const vendasP = new Set(vendasDoPeriodo(contratos, periodo.de, periodo.ate));

  for (const c of contratos) {
    const cidade = c.clientes?.cidade ?? null;
    const bairro = c.clientes?.bairro ?? null;
    if (!cidade || !bairro) continue;
    const chave = `${cidade}|${bairro}`;
    if (!centroide.has(chave)) continue; // sem centroide cadastrado, fica fora do mapa
    const atual = porBairro.get(chave) ?? {
      vendasPeriodo: 0,
      clientesAtivos: 0,
      receitaPeriodo: 0,
    };
    if (vendasP.has(c)) {
      atual.vendasPeriodo += 1;
      atual.receitaPeriodo += c.valor_mensalidade;
    }
    if (c.status === "ativo") atual.clientesAtivos += 1;
    porBairro.set(chave, atual);
  }

  const pontos: PontoBairro[] = [...porBairro.entries()]
    .map(([chave, valores]) => {
      const [cidade, bairro] = chave.split("|");
      const [lat, lng] = centroide.get(chave)!;
      return { cidade, bairro, lat, lng, ...valores };
    })
    .filter((p) => p.vendasPeriodo > 0 || p.clientesAtivos > 0)
    .sort((a, b) => b.vendasPeriodo - a.vendasPeriodo);

  const centro: [number, number] =
    pontos.length > 0
      ? [
          pontos.reduce((s, p) => s + p.lat, 0) / pontos.length,
          pontos.reduce((s, p) => s + p.lng, 0) / pontos.length,
        ]
      : [-2.44, -54.7]; // Santarém

  return { pontos, centro };
}
