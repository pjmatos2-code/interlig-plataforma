import { exigirUsuario } from "@/lib/auth";
import { navDoPerfil } from "@/lib/nav";
import { AppShell } from "@/components/layout/app-shell";
import { criarClienteServidor } from "@/lib/supabase/server";
import { haQuantoTempo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();

  // Selo "atualizado há X min" exigido na seção 11 do PRD.
  const supabase = criarClienteServidor();
  const { data: sync } = await supabase
    .from("vw_ultima_sync")
    .select("finalizado_em")
    .eq("entidade", "contratos")
    .maybeSingle();

  return (
    <AppShell
      usuario={usuario}
      itens={navDoPerfil(usuario.perfil)}
      atualizadoEm={`SGP atualizado ${haQuantoTempo(sync?.finalizado_em ?? null)}`}
    >
      {children}
    </AppShell>
  );
}
