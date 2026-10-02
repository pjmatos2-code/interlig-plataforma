import { exigirUsuario } from "@/lib/auth";
import { navDoPerfil } from "@/lib/nav";
import { AppShell } from "@/components/layout/app-shell";
import { criarClienteServidor } from "@/lib/supabase/server";
import { haQuantoTempo } from "@/lib/format";
import { criarClienteAdmin } from "@/lib/supabase/admin";

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

  // Fidelidade da base é da coordenação das UNIDADES (Aline Moraes em Brasil
  // Novo, Railson em Vitória do Xingu); a coordenação de Altamira cuida de
  // equipes (Marcelo Otávio, Rayssa) e não vê
  let itens = navDoPerfil(usuario.perfil);
  if (usuario.perfil === "supervisor") {
    const { data: pop } = usuario.pop_id
      ? await criarClienteAdmin().from("pops").select("nome").eq("id", usuario.pop_id).maybeSingle()
      : { data: null };
    // Fidelidade e Meu painel (comissão de coordenação) são da coordenação de unidade
    if (!["Brasil Novo", "Vitória do Xingu"].includes(String(pop?.nome ?? ""))) {
      itens = itens.filter((i) => i.href !== "/fidelidade" && i.href !== "/meu-painel");
    }
  }

  return (
    <AppShell
      usuario={usuario}
      itens={itens}
      atualizadoEm={`SGP atualizado ${haQuantoTempo(sync?.finalizado_em ?? null)}`}
    >
      {children}
    </AppShell>
  );
}
