import { redirect } from "next/navigation";
import { exigirUsuario, rotaInicial } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const usuario = await exigirUsuario();
  redirect(rotaInicial(usuario.perfil));
}
