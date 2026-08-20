import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function SemAcesso({ searchParams }: { searchParams: { motivo?: string } }) {
  const inativo = searchParams.motivo === "inativo";

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{inativo ? "Acesso desativado" : "Sem permissão"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {inativo
              ? "Seu usuário está inativo na plataforma. Fale com o gestor comercial."
              : "Seu perfil não tem acesso a esta tela. Se acredita que isso é um erro, fale com o gestor comercial."}
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Voltar ao início
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
