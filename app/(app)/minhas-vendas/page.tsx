import { exigirUsuario } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PainelEscopo } from "@/components/layout/painel-escopo";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function MinhasVendasPage() {
  const usuario = await exigirUsuario();

  return (
    <>
      <CabecalhoPagina
        titulo="Minhas vendas"
        descricao="Seu resultado do mês, sua meta e seu pace."
        referencia="PRD 3.2 e 3.7"
      />
      <PainelEscopo usuario={usuario} />
      <EmConstrucao
        fase="Fase 1 (MVP)"
        entrega={[
          "Vendas do mês, receita contratada e ticket médio próprios (5.1 a 5.3)",
          "% da meta e pace — quantas vendas por dia faltam até o fim do mês (5.4 e 5.5)",
          "Lista das próprias vendas com status na esteira de ativação",
          "Simulador de comissão e streak entram na Fase 3 (seção 6 e regra 5.13)",
        ]}
      />
    </>
  );
}
