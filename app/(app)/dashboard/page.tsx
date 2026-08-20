import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PainelEscopo } from "@/components/layout/painel-escopo";
import { EmConstrucao } from "@/components/layout/em-construcao";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);

  return (
    <>
      <CabecalhoPagina
        titulo="Dashboard geral"
        descricao={
          usuario.perfil === "gestor"
            ? "Visão consolidada de todas as POPs."
            : "Visão da sua POP."
        }
        referencia="PRD 3.1"
      />
      <PainelEscopo usuario={usuario} />
      <EmConstrucao
        fase="Fase 1 (MVP)"
        entrega={[
          "Cards de KPI: vendas, receita contratada, ticket médio, % da meta e pace (regras 5.1 a 5.5)",
          "Ativações pendentes e contratos pendentes de assinatura com alerta de idade (5.7 e 5.8)",
          "Vendas diárias com linha de meta, vendas por POP e mix de planos",
          "Origem de cadastro e projeção de fechamento do mês (regra 5.6)",
          "Filtro global de período e de POP aplicado à tela inteira",
        ]}
      />
    </>
  );
}
