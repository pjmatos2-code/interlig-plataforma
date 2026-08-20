import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function EsteiraPage() {
  await exigirPerfil(["gestor", "supervisor"]);

  return (
    <>
      <CabecalhoPagina
        titulo="Esteira de ativação"
        descricao="Onde a venda está parada: assinatura, instalação ou ativação."
        referencia="PRD 3.5"
      />
      <EmConstrucao
        fase="Fase 1 (MVP)"
        entrega={[
          "Kanban vendida → pendente assinatura → aguardando instalação → instalada",
          "Idade em cada etapa, com vermelho a partir de 48h na assinatura (regra 5.8)",
          "Tempo médio venda→ativação por POP e por vendedora",
          "Taxa de instalação efetiva em até 15 dias (regra 5.9)",
        ]}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        A view <code>vw_esteira</code> já existe no banco e classifica cada contrato por etapa e
        idade — a tela consome ela.
      </p>
    </>
  );
}
