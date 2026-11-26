import { redirect } from "next/navigation";
import { exigirUsuario, rotaInicial } from "@/lib/auth";
import { vendedorDoMeuDia } from "@/lib/meu-dia/dados";
import { MEU_DIA_ATIVO } from "@/lib/meu-dia/regras";

export const dynamic = "force-dynamic";

export default async function Home() {
  const usuario = await exigirUsuario({ restritos: true });
  // piloto do Meu Dia (14/10/2026): quem está nele começa o dia por lá
  if (MEU_DIA_ATIVO && (await vendedorDoMeuDia(usuario.id))) redirect("/meu-dia");
  redirect(rotaInicial(usuario.perfil));
}
