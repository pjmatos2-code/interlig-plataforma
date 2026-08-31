import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { PainelMinhaComissao } from "@/components/comissao/minha-comissao";
import { MinhaRefidelizacao } from "@/components/refidelizacao/minha-refidelizacao";
import { CartaoAgenteComercial } from "@/components/agentes/cartao-agente-comercial";
import { minhaComissao } from "@/lib/comissao/minha";
import { refidelizacaoDoMes } from "@/lib/refidelizacao/dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { lerConfigSgp } from "@/lib/integracoes/config";

export const dynamic = "force-dynamic";

/**
 * "Minha comissão" — uma rota para todo mundo que recebe variável, mostrando o
 * painel do setor da pessoa. O comercial vê a comissão de venda; o Atendimento,
 * a refidelização. Antes isso vivia no fim de "Minhas vendas", onde a
 * informação mais importante do mês ficava abaixo de tudo.
 */
export default async function MinhaComissaoPage() {
  const usuario = await exigirUsuario();

  if (!usuario.vendedor_id) {
    return (
      <>
        <CabecalhoPagina titulo="Minha comissão" descricao="Seu resultado do mês." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Seu usuário não está vinculado a um cadastro de agente. O vínculo é feito pelo
            Administrador em Administração → Usuários e perfis.
          </CardContent>
        </Card>
      </>
    );
  }

  const { data: agente } = await criarClienteAdmin()
    .from("vendedores")
    .select("nome, setor, sgp_login")
    .eq("id", usuario.vendedor_id)
    .maybeSingle();

  // ---------- Setor de Retenção: o painel dela já mostra taxa/faixa/comissão ----------
  if (agente?.setor === "retencao") {
    const { redirect } = await import("next/navigation");
    redirect("/retencao");
  }

  // ---------- Setor de Atendimento: refidelização ----------
  if (agente?.setor === "atendimento") {
    const login = (agente.sgp_login as string | null)?.toLowerCase();
    const dados = login ? (await refidelizacaoDoMes(undefined, [login])).agentes[0] ?? null : null;
    const cfg = await lerConfigSgp();
    const baseSgp = `${(cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "")}/admin`;

    return (
      <>
        <CabecalhoPagina
          titulo="Minha comissão"
          descricao={`${agente.nome} · Setor de Atendimento · refidelização do mês corrente`}
        />
        {dados ? (
          <MinhaRefidelizacao dados={dados} baseSgp={baseSgp} />
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nenhum aditivo registrado neste mês.
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  // ---------- comercial: comissão de venda ----------
  return (
    <>
      <CabecalhoPagina
        titulo="Minha comissão"
        descricao={`${agente?.nome ?? ""} · resultado, pendências e simulador do mês corrente`}
      />
      <CartaoAgenteComercial vendedorId={usuario.vendedor_id} />
      <PainelMinhaComissao
        dados={await minhaComissao(usuario.vendedor_id)}
        demonstrativo={await ultimoDemonstrativo(usuario.vendedor_id)}
        linkTemplate={await templateLinkSgp()}
      />
    </>
  );
}

/** Última competência fechada — só aí existe demonstrativo oficial. */
async function ultimoDemonstrativo(vendedorId: string) {
  const { data } = await criarClienteAdmin()
    .from("comissoes_fechadas")
    .select("mes_ano")
    .eq("vendedor_id", vendedorId)
    .order("mes_ano", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { vendedorId, mes: data.mes_ano as string } : null;
}
