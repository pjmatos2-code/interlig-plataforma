import type { Metadata } from "next";

/**
 * Modo Apresentação: telas para projetar em reunião, fora do menu e do
 * cabeçalho da plataforma. Cada página confere login e perfil por conta
 * própria (exigirPerfil); nenhuma rota daqui é pública.
 */
export const metadata: Metadata = { title: "Apresentação · GRR Comercial · Interlig" };

export default function LayoutApresentacao({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-slate-100 text-slate-900">{children}</div>;
}
