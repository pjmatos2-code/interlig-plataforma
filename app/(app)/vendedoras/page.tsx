import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function VendedorasPage() {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);

  return (
    <>
      <CabecalhoPagina
        titulo="Painel por vendedora"
        descricao={
          usuario.perfil === "gestor"
            ? "Desempenho de todas as vendedoras."
            : "Desempenho do seu time."
        }
        referencia="PRD 3.2 e 3.3"
      />
      <EmConstrucao
        fase="Fase 1 (MVP)"
        entrega={[
          "Tabela: vendas, receita, ticket médio, % da meta, pace e tendência vs semana anterior",
          "Drill-down por vendedora com as vendas listadas e histórico de meta de 6 meses",
          "Ranking gamificado, pódio, streak e badges entram na Fase 3 (regra 5.13)",
        ]}
      />
    </>
  );
}
