import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoInterlig } from "@/components/marca/logo-interlig";
import { FormularioLogin } from "./formulario";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { proximo?: string };
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-interlig-marinho p-4">
      {/* Imagem oficial da identidade (public/marca/grafico.png) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/marca/grafico.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-interlig-marinho/70 via-interlig-marinho/40 to-interlig-marinho/80"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center gap-8">
        <LogoInterlig variante="clara" tamanho="lg" />

        <Card className="w-full border-white/10 bg-white/95 shadow-2xl backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg text-interlig-marinho">Inteligência Comercial</CardTitle>
            <CardDescription>Entre com seu e-mail corporativo.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioLogin proximo={searchParams.proximo ?? "/"} />
          </CardContent>
        </Card>

        <p className="text-xs text-white/50">Interlig Internet Fibra · uso interno</p>
      </div>
    </main>
  );
}
