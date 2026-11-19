import { cn } from "@/lib/utils";
import { ROTULO_APROVACAO_PLANO, ROTULO_SITUACAO_PLANO, type AprovacaoPlano, type SituacaoPlano } from "@/lib/grr/planos";

const COR_SITUACAO: Record<SituacaoPlano | "atrasada", string> = {
  pendente: "bg-muted text-muted-foreground",
  em_andamento: "border-interlig-ceu/40 bg-interlig-ceu/10 text-interlig-azul",
  aguardando_validacao: "border-farol-amarelo/40 bg-farol-amarelo/15 text-amber-800",
  concluida: "border-farol-verde/30 bg-farol-verde/10 text-green-800",
  cancelada: "bg-muted text-muted-foreground line-through",
  atrasada: "border-farol-vermelho/30 bg-farol-vermelho/10 text-red-800",
};
const COR_APROVACAO: Record<AprovacaoPlano, string> = {
  aguardando: "border-farol-amarelo/40 bg-farol-amarelo/15 text-amber-800",
  aprovado: "border-farol-verde/30 bg-farol-verde/10 text-green-800",
  ajuste: "border-interlig-ceu/40 bg-interlig-ceu/10 text-interlig-azul",
  rejeitado: "border-farol-vermelho/30 bg-farol-vermelho/10 text-red-800",
};

export function SeloSituacao({ s, className }: { s: SituacaoPlano | "atrasada"; className?: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", COR_SITUACAO[s], className)}>{ROTULO_SITUACAO_PLANO[s]}</span>;
}
export function SeloAprovacao({ a, className }: { a: AprovacaoPlano; className?: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", COR_APROVACAO[a], className)}>{ROTULO_APROVACAO_PLANO[a]}</span>;
}
