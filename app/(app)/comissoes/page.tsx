import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { PainelComissoesComercial } from "@/components/comissao/painel-comissoes";

export const dynamic = "force-dynamic";

export default async function ComissoesPage({ searchParams }: { searchParams: { mes?: string } }) {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  return (
    <>
      <CabecalhoPagina
        titulo="Comissões do comercial"
        descricao="Meta, reposição de inadimplentes, vendas, ativações, aprovações e atingimento de cada agente — com a conta e os contratos por trás de cada número."
      />
      <PainelComissoesComercial
        mesPedido={searchParams.mes}
        linkMes={(m) => `/comissoes?mes=${m}`}
        ehGestor={usuario.perfil === "gestor"}
        podeVerPainelAgente
      />
    </>
  );
}
