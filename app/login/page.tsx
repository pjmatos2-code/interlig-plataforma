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
      {/* Clima da identidade: pontos de luz e linhas de fibra sobre o marinho */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42rem 28rem at 18% 12%, rgba(30,136,229,0.28), transparent 60%)," +
            "radial-gradient(36rem 24rem at 85% 78%, rgba(127,184,242,0.16), transparent 60%)," +
            "radial-gradient(2px 2px at 22% 64%, rgba(255,255,255,0.7), transparent 100%)," +
            "radial-gradient(2px 2px at 41% 28%, rgba(255,255,255,0.5), transparent 100%)," +
            "radial-gradient(3px 3px at 62% 71%, rgba(127,184,242,0.8), transparent 100%)," +
            "radial-gradient(2px 2px at 78% 36%, rgba(255,255,255,0.55), transparent 100%)," +
            "radial-gradient(2px 2px at 90% 14%, rgba(127,184,242,0.6), transparent 100%)," +
            "linear-gradient(115deg, transparent 46%, rgba(30,136,229,0.10) 50%, transparent 54%)," +
            "linear-gradient(65deg, transparent 58%, rgba(127,184,242,0.08) 62%, transparent 66%)",
        }}
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
