import { exigirUsuario } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { retencaoDoMes } from "@/lib/retencao/dados";
import { PainelRetencao } from "./painel";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RetencaoPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const usuario = await exigirUsuario();
  if (!["gestor", "agente_retencao"].includes(usuario.perfil)) redirect("/sem-acesso");

  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? `${searchParams.mes}-01` : undefined;

  // agente vê só os próprios casos; gestor vê todos
  let login: string | null = null;
  if (usuario.perfil === "agente_retencao" && usuario.vendedor_id) {
    const { data: v } = await criarClienteAdmin()
      .from("vendedores").select("sgp_login").eq("id", usuario.vendedor_id).maybeSingle();
    login = (v?.sgp_login as string | null)?.toLowerCase() ?? null;
  }

  const meses = await retencaoDoMes(mes, login);

  return (
    <>
      <CabecalhoPagina
        titulo="Retenção"
        descricao="Retido e perdido são carimbados pela auditoria no SGP. Irreversível (mudança/inviabilidade) não penaliza a taxa."
      />
      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Competência</span>
          <input type="month" name="mes" defaultValue={(mes ?? new Date().toISOString()).slice(0, 7)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        </label>
        <button type="submit" className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">
          Aplicar
        </button>
      </form>
      <PainelRetencao meses={meses} ehGestor={usuario.perfil === "gestor"} />
    </>
  );
}
