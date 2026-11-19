import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CartaoGrr } from "@/lib/grr/montar";

const ROTULO_STATUS: Record<CartaoGrr["status"], string> = { ok: "No ritmo", atencao: "Atenção", critico: "Crítico", sem_meta: "Sem meta" };
const VARIANTE = { ok: "verde", atencao: "amarelo", critico: "vermelho", sem_meta: "outline" } as const;

/** Cartão do resumo do GRR: realizado, meta, evolução e farol. Abre o detalhe do grupo. */
export function CartaoIndicador({ cartao, href }: { cartao: CartaoGrr; href: string }) {
  const { status } = cartao;
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card
        className={cn(
          "h-full transition-colors group-hover:border-interlig-ceu",
          status === "ok" && "border-l-4 border-l-farol-verde",
          status === "atencao" && "border-l-4 border-l-farol-amarelo",
          status === "critico" && "border-l-4 border-l-farol-vermelho"
        )}
      >
        <CardContent className="min-w-0 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-medium leading-tight text-muted-foreground">{cartao.rotulo}</p>
            <Badge variant={VARIANTE[status]} className={cn("shrink-0 whitespace-nowrap", status === "sem_meta" && "font-normal text-muted-foreground")}>
              {ROTULO_STATUS[status]}
            </Badge>
          </div>
          <p className={cn("mt-1 font-semibold leading-snug tabular-nums tracking-tight", cartao.valor.length <= 9 ? "text-2xl" : "text-xl")}>{cartao.valor}</p>
          {cartao.meta && <p className="mt-0.5 text-xs font-medium tabular-nums">{cartao.meta}</p>}
          {cartao.evolucao && (
            <p
              className={cn(
                "mt-1 text-xs font-medium tabular-nums",
                cartao.evolucao.bom === true && "text-farol-verde",
                cartao.evolucao.bom === false && "text-farol-vermelho",
                cartao.evolucao.bom === null && "text-muted-foreground"
              )}
            >
              {cartao.evolucao.direcao === "sobe" ? "▲" : cartao.evolucao.direcao === "desce" ? "▼" : "•"} {cartao.evolucao.texto}
            </p>
          )}
          {cartao.contexto && <p className="mt-1 text-xs leading-snug text-muted-foreground">{cartao.contexto}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}
