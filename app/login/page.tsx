import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioLogin } from "./formulario";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { proximo?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Interlig · Inteligência Comercial</CardTitle>
          <CardDescription>Entre com seu e-mail corporativo.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioLogin proximo={searchParams.proximo ?? "/"} />
        </CardContent>
      </Card>
    </main>
  );
}
