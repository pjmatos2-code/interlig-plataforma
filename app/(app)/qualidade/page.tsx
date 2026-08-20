import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function QualidadePage() {
  await exigirPerfil(["gestor", "supervisor"]);

  return (
    <>
      <CabecalhoPagina
        titulo="Qualidade da venda"
        descricao="Churn precoce e inadimplência por safra e por canal."
        referencia="PRD 3.8"
      />
      <EmConstrucao
        fase="Fase 4"
        entrega={[
          "Churn precoce: cancelados em até 90 dias da ativação, por vendedora, origem e POP (regra 5.10)",
          "Inadimplência de 1ª fatura por safra e por canal (regra 5.11)",
          "Cruzamento vendas × churn precoce: volume alto com qualidade baixa",
        ]}
      />
    </>
  );
}
