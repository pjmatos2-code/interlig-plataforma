import type { Situacao } from "@/lib/grr/painel";

/*
 * Situação dos indicadores: rosca com as quatro faixas (na meta, atenção,
 * crítico e sem meta). Sem meta fica em cinza e nunca conta como bom. Cada
 * segmento tem 2px de folga; a legenda traz nome, quantidade e percentual,
 * então a cor nunca é a única pista.
 */
const FAIXAS = [
  { chave: "ok", rotulo: "Na meta", cor: "hsl(142 71% 40%)" },
  { chave: "atencao", rotulo: "Atenção", cor: "hsl(45 93% 47%)" },
  { chave: "critico", rotulo: "Crítico", cor: "hsl(0 72% 51%)" },
  { chave: "semMeta", rotulo: "Sem meta", cor: "#cbd5e1" },
] as const;

export function RoscaSituacao({ situacao, grande = false, gruposSemDados = 0 }: { situacao: Situacao; grande?: boolean; gruposSemDados?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, situacao.total);
  const folga = situacao.total > 1 ? 2 : 0;
  let acumulado = 0;
  const segmentos = FAIXAS.map((f) => {
    const n = situacao[f.chave];
    const tam = (n / total) * c;
    const s = { ...f, n, inicio: acumulado, tam };
    acumulado += tam;
    return s;
  }).filter((s) => s.n > 0);
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className={grande ? "flex flex-col items-center gap-6 sm:flex-row sm:gap-10" : "flex flex-col items-center gap-4 sm:flex-row"}>
      <div className={grande ? "relative h-56 w-56 shrink-0" : "relative h-36 w-36 shrink-0"}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${situacao.ok} de ${situacao.total} indicadores na meta`}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="13" className="stroke-muted" />
          {segmentos.map((s) => (
            <circle key={s.chave} cx="50" cy="50" r={r} fill="none" strokeWidth="13" stroke={s.cor} strokeDasharray={`${Math.max(0, s.tam - folga)} ${c}`} strokeDashoffset={-s.inicio}>
              <title>{`${s.rotulo}: ${s.n} (${pct(s.n)})`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
          <span className={grande ? "text-5xl font-bold tabular-nums" : "text-3xl font-bold tabular-nums"}>{situacao.ok}</span>
          <span className={grande ? "text-base text-muted-foreground" : "text-xs text-muted-foreground"}>de {situacao.total} na meta</span>
        </div>
      </div>
      <ul className={grande ? "w-full space-y-3 text-lg" : "w-full min-w-0 space-y-2 text-sm"}>
        {FAIXAS.map((f) => (
          <li key={f.chave} className="flex items-center gap-2">
            <span className={grande ? "h-4 w-4 shrink-0 rounded" : "h-3 w-3 shrink-0 rounded-sm"} style={{ background: f.cor }} aria-hidden />
            <span className="flex-1">{f.rotulo}</span>
            <span className="font-semibold tabular-nums">{situacao[f.chave]}</span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">{situacao.total ? pct(situacao[f.chave]) : "—"}</span>
          </li>
        ))}
        {gruposSemDados > 0 && (
          <li className={grande ? "pt-1 text-base text-muted-foreground" : "pt-1 text-xs text-muted-foreground"}>
            {gruposSemDados === 1 ? "Mais 1 grupo sem dados (previsto na Etapa 5), fora da conta." : `Mais ${gruposSemDados} grupos sem dados (previstos na Etapa 5), fora da conta.`}
          </li>
        )}
      </ul>
    </div>
  );
}
