import { exigirUsuario } from "@/lib/auth";
import { navDoPerfil } from "@/lib/nav";
import { AppShell } from "@/components/layout/app-shell";
import { criarClienteServidor } from "@/lib/supabase/server";
import { haQuantoTempo } from "@/lib/format";
import { timeDoCoordenador } from "@/lib/coordenacao";

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

  // Fidelidade da base é da coordenação de UNIDADE (Aline Moraes, Railson);
  // quem coordena equipe (Marcelo Otávio, Rayssa) não vê
  let itens = navDoPerfil(usuario.perfil);
  if (usuario.perfil === "supervisor" && (await timeDoCoordenador(usuario.id))) {
    itens = itens.filter((i) => i.href !== "/fidelidade");
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
