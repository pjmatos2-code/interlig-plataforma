import { exigirUsuario } from "@/lib/auth";
import { navDoPerfil } from "@/lib/nav";
import { AppShell } from "@/components/layout/app-shell";
import { criarClienteServidor } from "@/lib/supabase/server";
import { haQuantoTempo } from "@/lib/format";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { avisosPendentes } from "@/lib/avisos/dados";
import { PopupAvisos } from "@/components/avisos/popup-avisos";
import { vendedorDoMeuDia } from "@/lib/meu-dia/dados";
import { AbrirMeuDia } from "@/components/meu-dia/abrir-meu-dia";
import { ProvedorInterChat } from "@/components/interchat/provedor";
import { DockInterChat } from "@/components/interchat/dock";
import { chavePublicaPush } from "@/lib/interchat/push";
import { carregarConfig } from "@/lib/performance/config-servidor";
import { perfilAbreModulo } from "@/lib/performance/escopo-regras";

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
      itens = itens.filter((i) => !["/fidelidade", "/meu-painel", "/prevencao"].includes(i.href));
    }
  }

  // Performance Comercial: por enquanto só o administrador; o gestor libera outros papéis em Configurações
  if (usuario.perfil !== "gestor" && itens.some((i) => i.href === "/performance")) {
    const cfgPerf = await carregarConfig().catch(() => null);
    if (!cfgPerf || !perfilAbreModulo(usuario.perfil, cfgPerf.acesso.papeis_modulo)) itens = itens.filter((i) => i.href !== "/performance");
  }

  // Meu Dia: só para quem está no piloto; o gestor usa a visão da equipe
  const noMeuDia = usuario.perfil === "gestor" ? null : await vendedorDoMeuDia(usuario.id).catch(() => null);
  itens = itens.filter((i) => i.href !== "/meu-dia" || Boolean(noMeuDia));

  // InterChat: foto da pessoa (cadastro de vendedoras ou do próprio usuário) e chave dos avisos
  const [{ data: vendFoto }, chavePush] = await Promise.all([
    usuario.vendedor_id
      ? criarClienteAdmin().from("vendedores").select("foto_url").eq("id", usuario.vendedor_id).maybeSingle()
      : criarClienteAdmin().from("usuarios").select("foto_url").eq("id", usuario.id).maybeSingle(),
    chavePublicaPush().catch(() => null),
  ]);
  const euChat = { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil, foto: (vendFoto?.foto_url as string | null) ?? null };

  return (
    <ProvedorInterChat eu={euChat} ehGestor={usuario.perfil === "gestor"} chavePush={chavePush}>
    <AppShell
      usuario={usuario}
      itens={itens}
      atualizadoEm={`SGP atualizado ${haQuantoTempo(sync?.finalizado_em ?? null)}`}
    >
      {children}
      <PopupAvisos iniciais={await avisosPendentes(usuario.id).catch(() => [])} />
      {noMeuDia && <AbrirMeuDia />}
      <DockInterChat />
    </AppShell>
    </ProvedorInterChat>
  );
}
