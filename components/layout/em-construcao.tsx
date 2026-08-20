import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function EmConstrucao({ fase, entrega }: { fase: string; entrega: string[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Módulo previsto para a {fase}</CardTitle>
        <Badge variant="outline">a implementar</Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          A fundação (banco, RLS, autenticação e navegação) já contempla este módulo. O que entra aqui:
        </p>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {entrega.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
