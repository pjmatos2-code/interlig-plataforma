import { exigirUsuario } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { detalheVendedora } from "@/lib/vendedoras/dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { PainelDetalheVendedora } from "@/components/vendedoras/painel-detalhe";
import { Card, CardContent } from "@/components/ui/card";
import { minhaComissao } from "@/lib/comissao/minha";
import { PainelMinhaComissao } from "@/components/comissao/minha-comissao";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { formatarData } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Última competência FECHADA da agente — só aí existe demonstrativo oficial
 * para baixar (o mês corrente ainda muda).
 */
async function ultimoDemonstrativo(vendedorId: string) {
  const { criarClienteAdmin } = await import("@/lib/supabase/admin");
  const { data } = await criarClienteAdmin()
    .from("comissoes_fechadas")
    .select("mes_ano")
    .eq("vendedor_id", vendedorId)
    .order("mes_ano", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { vendedorId, mes: data.mes_ano as string } : null;
}

export default async function MinhasVendasPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string };
}) {
  const usuario = await exigirUsuario();
  const periodo = resolverPeriodo(searchParams);

  // A vendedora vê apenas os próprios números (PRD seção 2). Gestor e
  // supervisor sem vínculo de vendedora caem no aviso abaixo.
  if (!usuario.vendedor_id) {
    return (
      <>
        <CabecalhoPagina
          titulo="Minhas vendas"
          descricao="Seu resultado do mês, sua meta e seu pace."
        />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Seu usuário não está vinculado a uma vendedora do SGP. Para acompanhar o time,
            use o Painel por Vendedora; o vínculo é feito pelo gestor na Administração.
          </CardContent>
        </Card>
      </>
    );
  }

  const detalhe = await detalheVendedora(usuario.vendedor_id, periodo);

  return (
    <>
      <CabecalhoPagina
        titulo="Minhas vendas"
        descricao={`${detalhe?.pop ?? ""} · ${formatarData(periodo.de)} a ${formatarData(periodo.ate)} · meta e pace do mês corrente`}
      />
      <FiltrosDashboard pops={[]} mostrarPop={false} de={periodo.de} ate={periodo.ate} />
      {detalhe && <PainelDetalheVendedora detalhe={detalhe} linkTemplate={await templateLinkSgp()} />}
      {usuario.vendedor_id && (
        <PainelMinhaComissao
          dados={await minhaComissao(usuario.vendedor_id)}
          demonstrativo={await ultimoDemonstrativo(usuario.vendedor_id)}
          linkTemplate={await templateLinkSgp()}
        />
      )}
    </>
  );
}
