import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";

const hojeStm = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

/**
 * Sinal leve das TVs: muda quando entra contrato com venda de hoje (quantos
 * são e o último criado). A TV comercial confere o sinal a cada 30 s e só
 * relê tudo quando ele muda, ou a cada 5 min; a TV de ranking usa o sinal
 * como chave do cache do servidor. Antes as duas reliam tudo a cada 15 a
 * 30 s, o que estourou a cota de saída de dados da Supabase em 04/11/2026.
 */
export async function sinalDaTv(): Promise<string> {
  const hoje = hojeStm();
  const { data, count, error } = await criarClienteAdmin()
    .from("contratos")
    .select("criado_em", { count: "exact" })
    .eq("data_venda", hoje)
    .order("criado_em", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return `${hoje}|${count ?? 0}|${(data?.[0]?.criado_em as string | undefined) ?? ""}`;
}
