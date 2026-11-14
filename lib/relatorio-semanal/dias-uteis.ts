import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { diaDaSemana } from "./periodo";

/**
 * Dias úteis do calendário comercial (tabela `calendario`, seg–sáb menos
 * feriados). Fora da faixa cadastrada, vale seg–sáb. Veio da Performance
 * Comercial, desativada em 13/11/2026.
 */
export async function carregarDiasUteis(de: string, ate: string): Promise<(dia: string) => boolean> {
  const mapa = new Map<string, boolean>();
  const admin = criarClienteAdmin();
  for (let off = 0; off < 5000; off += 1000) {
    const { data } = await admin
      .from("calendario")
      .select("data, dia_util")
      .gte("data", de)
      .lte("data", ate)
      .order("data")
      .range(off, off + 999);
    for (const r of data ?? []) mapa.set(String(r.data).slice(0, 10), Boolean(r.dia_util));
    if (!data || data.length < 1000) break;
  }
  return (dia: string) => mapa.get(dia) ?? diaDaSemana(dia) !== 0;
}
