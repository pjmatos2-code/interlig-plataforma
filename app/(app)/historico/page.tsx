import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { historicoPorAgente, competenciasFechadas } from "@/lib/comissao/financeiro";
import { HistoricoTab } from "@/app/(app)/financeiro/historico-tab";

export const dynamic = "force-dynamic";

/** Histórico de comissões pagas por agente — módulo próprio (pedido de 31/08). */
export default async function HistoricoPage() {
  await exigirPerfil(["gestor", "financeiro", "direcao"]);
  const fechadas = await competenciasFechadas();
  const [dados, { data: vends }] = await Promise.all([
    fechadas.length > 0
      ? historicoPorAgente(fechadas[0])
      : Promise.resolve({ meses: [], agentes: [] }),
    criarClienteAdmin().from("vendedores").select("id, nome, foto_url").eq("ativo", true).order("nome"),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Histórico de comissões"
        descricao="Últimas competências fechadas por agente — valores congelados no fechamento, com análise de variação."
      />
      <HistoricoTab
        dados={dados}
        ativos={(vends ?? []).map((v) => ({
          id: v.id as string,
          nome: v.nome as string,
          foto: (v.foto_url as string | null) ?? null,
        }))}
      />
    </>
  );
}
