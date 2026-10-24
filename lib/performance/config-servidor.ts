import "server-only";
import * as React from "react";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { mesclarConfig, type ConfigPerformance } from "./config";
import { segASab } from "./expediente";

// cache por requisição do React Server Components; fora dele (scripts de
// carga histórica rodando no Node puro) vira uma função comum
const cache: <T extends (...a: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

/** configuração vigente do módulo (padrões + o que o gestor salvou) */
export const carregarConfig = cache(async (): Promise<ConfigPerformance> => {
  const { data } = await criarClienteAdmin()
    .from("config_comercial")
    .select("valor")
    .eq("chave", "performance")
    .maybeSingle();
  return mesclarConfig(data?.valor ?? null);
});

/**
 * Dias úteis do calendário comercial (tabela `calendario`, seg–sáb menos
 * feriados). Fora da faixa cadastrada, vale seg–sáb.
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
  return (dia: string) => mapa.get(dia) ?? segASab(dia);
}

/** estado operacional do módulo (cursores de coleta etc.), fora da config do gestor */
export async function lerEstado<T extends Record<string, unknown>>(chave: string): Promise<T> {
  const { data } = await criarClienteAdmin().from("config_comercial").select("valor").eq("chave", chave).maybeSingle();
  return ((data?.valor ?? {}) as T) ?? ({} as T);
}

export async function gravarEstado(chave: string, valor: Record<string, unknown>): Promise<void> {
  await criarClienteAdmin()
    .from("config_comercial")
    .upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
}
