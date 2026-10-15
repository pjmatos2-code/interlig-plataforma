import { redirect } from "next/navigation";
import { exigirUsuario, rotaInicial } from "@/lib/auth";
import { vendedorDoMeuDia } from "@/lib/meu-dia/dados";

export const dynamic = "force-dynamic";

export default async function Home() {
  const usuario = await exigirUsuario();
  // piloto do Meu Dia (14/10/2026): quem está nele começa o dia por lá
  if (await vendedorDoMeuDia(usuario.id)) redirect("/meu-dia");
  redirect(rotaInicial(usuario.perfil));
}
