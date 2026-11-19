import { CircleDollarSign, Crosshair, Filter, Receipt, ShoppingCart, UserMinus, Users, Wifi, type LucideIcon } from "lucide-react";
import type { GrupoGrr } from "@/lib/grr/catalogo";

/** um ícone por grupo do GRR, o mesmo no painel e na apresentação */
export const ICONE_DO_GRUPO: Record<GrupoGrr, LucideIcon> = {
  vendas: ShoppingCart,
  ativacoes: Wifi,
  conversao: Filter,
  receita: CircleDollarSign,
  produtividade: Users,
  perdas: Crosshair,
  inadimplencia: Receipt,
  churn: UserMinus,
};

export const ROTULO_STATUS = { ok: "Na meta", atencao: "Atenção", critico: "Crítico", sem_meta: "Sem meta" } as const;

/** classes do selo de situação (texto sempre em tom de texto, a cor só no fundo e na borda) */
export const SELO_STATUS = {
  ok: "border-farol-verde/30 bg-farol-verde/10 text-green-800 dark:text-green-300",
  atencao: "border-farol-amarelo/40 bg-farol-amarelo/15 text-amber-800 dark:text-amber-300",
  critico: "border-farol-vermelho/30 bg-farol-vermelho/10 text-red-800 dark:text-red-300",
  sem_meta: "border-border bg-muted text-muted-foreground",
} as const;

export const COR_STATUS = { ok: "text-farol-verde", atencao: "text-farol-amarelo", critico: "text-farol-vermelho", sem_meta: "text-muted-foreground" } as const;
