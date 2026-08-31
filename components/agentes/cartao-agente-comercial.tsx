import { criarClienteAdmin } from "@/lib/supabase/admin";
import { minhaComissao } from "@/lib/comissao/minha";
import { formatarMoeda } from "@/lib/format";
import { CartaoAgente } from "./cartao-agente";

/**
 * Wrapper do card de identificação para os agentes COMERCIAIS (interna,
 * externa e corporativo): busca nome/foto e o resultado do mês corrente com o
 * mesmo motor de "Minha comissão".
 */
export async function CartaoAgenteComercial({ vendedorId }: { vendedorId: string }) {
  const admin = criarClienteAdmin();
  const [{ data: v }, c] = await Promise.all([
    admin
      .from("vendedores")
      .select("nome, foto_url, pops(nome)")
      .eq("id", vendedorId)
      .maybeSingle(),
    minhaComissao(vendedorId),
  ]);
  if (!v) return null;

  const r = c.resultado;
  const pct = r?.atingimentoPct ?? null;
  const pop = (v.pops as unknown as { nome: string } | null)?.nome ?? null;
  return (
    <CartaoAgente
      nome={v.nome as string}
      foto={(v.foto_url as string | null) ?? null}
      resumo={
        r
          ? `${r.vendasComissionaveis} venda(s) liberadas · ${Math.round(r.atingimentoPct)}% da meta${pop ? ` · ${pop}` : ""}`
          : `sem regra de comissão vigente${pop ? ` · ${pop}` : ""}`
      }
      stats={[
        { rotulo: "Pendências", valor: String(c.pendentes.length) },
        ...(r && r.debitoMeta > 0 ? [{ rotulo: "Débito", valor: `+${r.debitoMeta} na meta` }] : []),
        { rotulo: "Comissão parcial", valor: formatarMoeda(r?.total ?? 0), destaque: true },
      ]}
      pctMeta={pct}
      subBarra={
        r
          ? `${c.faixaAtual ? `Faixa ${c.faixaAtual} · ` : ""}meta ${r.metaEfetiva} venda(s)${r.vendasPendentes > 0 ? ` · liberando as pendentes: ${formatarMoeda(r.totalSeLiberar)}` : ""}`
          : undefined
      }
    />
  );
}
