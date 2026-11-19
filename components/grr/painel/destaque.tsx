import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CartaoPainel } from "@/lib/grr/painel";
import { textoAtingimento } from "@/lib/grr/painel";
import { COR_STATUS, ICONE_DO_GRUPO, ROTULO_STATUS, SELO_STATUS } from "./icones";

/** anel de progresso: só existe quando há meta válida e o percentual representa o desempenho */
export function AnelMeta({ atingimento, status, tamanho = 64 }: { atingimento: number; status: CartaoPainel["status"]; tamanho?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, atingimento));
  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`${textoAtingimento(atingimento)} da meta`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke="currentColor" strokeDasharray={`${c * p} ${c}`} className={COR_STATUS[status]} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[13px] font-bold tabular-nums" style={{ fontSize: tamanho / 4.6 }}>
          {textoAtingimento(atingimento)}
        </span>
        <span className="mt-0.5 text-[9px] text-muted-foreground" style={{ fontSize: Math.max(9, tamanho / 7.5) }}>
          da meta
        </span>
      </span>
    </div>
  );
}

export function Evolucao({ evolucao, curta = false, className }: { evolucao: CartaoPainel["evolucao"]; curta?: boolean; className?: string }) {
  if (!evolucao) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const seta = evolucao.direcao === "sobe" ? "▲" : evolucao.direcao === "desce" ? "▼" : "•";
  const texto = curta ? evolucao.texto.replace(/ (acima|abaixo) da semana anterior$/, "").replace("igual à semana anterior", "igual") : evolucao.texto;
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        evolucao.bom === true && "text-green-700 dark:text-green-400",
        evolucao.bom === false && "text-red-700 dark:text-red-400",
        evolucao.bom === null && "text-muted-foreground",
        className
      )}
    >
      <span aria-hidden>{seta}</span> {curta && evolucao.direcao === "desce" ? "−" : curta && evolucao.direcao === "sobe" ? "+" : ""}
      {texto}
    </span>
  );
}

/** cartão grande da primeira linha do Resumo executivo */
export function CartaoDestaque({ cartao, href }: { cartao: CartaoPainel; href: string }) {
  const Icone = ICONE_DO_GRUPO[cartao.grupo];
  const temAnel = cartao.atingimento != null;
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col justify-between gap-2 rounded-2xl border bg-card p-4 shadow-sm transition hover:border-interlig-ceu hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-interlig-azul/10 text-interlig-azul">
              <Icone className="h-4 w-4" aria-hidden />
            </span>
            <p className="text-sm font-semibold leading-tight">{cartao.rotulo}</p>
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
            <span className={cn("font-bold tracking-tight", cartao.valor.length <= 8 ? "text-3xl" : "text-2xl")}>{cartao.valor}</span>
            {cartao.metaNumero != null && cartao.meta && <span className="text-base font-medium text-muted-foreground">/ {cartao.meta.replace(/^meta /, "")}</span>}
          </p>
        </div>
        {temAnel ? (
          <AnelMeta atingimento={cartao.atingimento!} status={cartao.status} />
        ) : (
          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", SELO_STATUS[cartao.status])}>{ROTULO_STATUS[cartao.status]}</span>
        )}
      </div>
      <div className="space-y-0.5 text-xs">
        <p>
          <Evolucao evolucao={cartao.evolucao} />
        </p>
        {cartao.contexto && <p className="line-clamp-2 leading-snug text-muted-foreground">{cartao.contexto}</p>}
      </div>
    </Link>
  );
}
