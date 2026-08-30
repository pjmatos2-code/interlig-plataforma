import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { MinhaRefidelizacao } from "@/components/refidelizacao/minha-refidelizacao";
import { refidelizacaoDoMes } from "@/lib/refidelizacao/dados";
import { lerConfigSgp } from "@/lib/integracoes/config";

export const dynamic = "force-dynamic";

/**
 * Painel da agente do Setor de Atendimento. Ela não vende, então não passa
 * por Minhas vendas: aqui vê a própria refidelização e, principalmente, os
 * aditivos que ainda não contam — para buscar a assinatura antes do fechamento.
 */
export default async function AtendimentoPage() {
  const usuario = await exigirPerfil(["agente_atendimento", "gestor"]);

  if (!usuario.vendedor_id) {
    return (
      <>
        <CabecalhoPagina titulo="Minha refidelização" descricao="Setor de Atendimento." />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Seu usuário não está vinculado a um cadastro de agente do SGP. O vínculo é feito pelo
            Administrador em Administração → Usuários e perfis.
          </CardContent>
        </Card>
      </>
    );
  }

  const { data: v } = await criarClienteAdmin()
    .from("vendedores")
    .select("nome, sgp_login")
    .eq("id", usuario.vendedor_id)
    .maybeSingle();
  const login = (v?.sgp_login as string | null)?.toLowerCase();

  const dados = login ? (await refidelizacaoDoMes(undefined, [login])).agentes[0] ?? null : null;
  const cfg = await lerConfigSgp();
  const baseSgp = (cfg.base_url ?? "").replace(/\/+$/, "").replace(/\/admin$/, "") + "/admin";

  return (
    <>
      <CabecalhoPagina
        titulo="Minha refidelização"
        descricao={`${v?.nome ?? ""} · Setor de Atendimento · mês corrente`}
      />
      {dados ? (
        <MinhaRefidelizacao dados={dados} baseSgp={baseSgp} />
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum aditivo registrado neste mês. Os dados são atualizados quando o Administrador
            sincroniza com o SGP.
          </CardContent>
        </Card>
      )}
    </>
  );
}
