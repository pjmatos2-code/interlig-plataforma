import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { detalheVendedora } from "@/lib/vendedoras/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { PainelDetalheVendedora } from "@/components/vendedoras/painel-detalhe";
import { formatarData } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendedoraDetalhePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { periodo?: string; de?: string; ate?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const periodo = resolverPeriodo(searchParams);

  // Coordenador só abre as agentes dele (bloqueia acesso por URL direta a outra).
  if (usuario.perfil === "supervisor") {
    const supabase = criarClienteServidor();
    const { data: v } = await supabase
      .from("vendedores")
      .select("coordenador_id")
      .eq("id", params.id)
      .maybeSingle();
    if (!v || v.coordenador_id !== usuario.id) notFound();
  }

  const detalhe = await detalheVendedora(params.id, periodo);
  if (!detalhe) notFound();

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/vendedoras" className="text-muted-foreground hover:text-foreground">
          ← Painel por vendedora
        </Link>
      </div>
      <CabecalhoPagina
        titulo={detalhe.nome}
        descricao={`${detalhe.pop} · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`}
      />
      <FiltrosDashboard pops={[]} mostrarPop={false} de={periodo.de} ate={periodo.ate} />
      <PainelDetalheVendedora detalhe={detalhe} />
    </>
  );
}
