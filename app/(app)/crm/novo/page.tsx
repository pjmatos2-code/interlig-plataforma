import Link from "next/link";
import { ehAgenteCrm } from "@/lib/tipos";
import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { FormularioNovoTicket } from "./formulario";

export const dynamic = "force-dynamic";

export default async function NovoTicketPage() {
  const usuario = await exigirUsuario();
  const supabase = criarClienteServidor();

  let consulta = supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome");
  if (usuario.perfil === "supervisor" && usuario.pop_id)
    consulta = consulta.eq("pop_id", usuario.pop_id);
  const { data: vendedoras } = await consulta;

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/crm" className="text-muted-foreground hover:text-foreground">
          ← CRM
        </Link>
      </div>
      <CabecalhoPagina
        titulo="Novo ticket"
        descricao="Para atendimentos que não passam pelo SZ Chat: presencial na loja, telefone, PAP na rua."
      />
      <Card className="max-w-xl">
        <CardContent className="pt-5">
          <FormularioNovoTicket
            vendedoras={vendedoras ?? []}
            perfilVendedora={ehAgenteCrm(usuario.perfil)}
          />
        </CardContent>
      </Card>
    </>
  );
}
