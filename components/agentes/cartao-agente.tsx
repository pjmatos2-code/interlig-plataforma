import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Card de identificação do agente com resumo de produtividade e comissão —
 * layout aprovado (31/08): foto, nome com farol, linha de resumo, estatísticas
 * à direita e barra de progresso da meta. Puramente visual; cada setor monta
 * os números no seu wrapper.
 */
export function CartaoAgente({
  nome,
  foto,
  resumo,
  stats,
  pctMeta,
  subBarra,
}: {
  nome: string;
  foto: string | null;
  /** ex.: "42 vendas · 84% da meta" */
  resumo: string;
  stats: { rotulo: string; valor: string; destaque?: boolean }[];
  /** null esconde a barra (setor sem meta numérica) */
  pctMeta: number | null;
  subBarra?: string;
}) {
  const cor =
    pctMeta === null ? "#64748b" : pctMeta >= 100 ? "#059669" : pctMeta >= 80 ? "#2563eb" : "#d97706";
  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <AvatarAgente nome={nome} foto={foto} tamanho="lg" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-base font-semibold">
                {nome}
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">{resumo}</p>
            </div>
          </div>
          <div className="ml-auto flex gap-6 text-sm">
            {stats.map((s) => (
              <div key={s.rotulo}>
                <p className="text-xs text-muted-foreground">{s.rotulo}</p>
                <p className={`font-semibold tabular-nums ${s.destaque ? "text-emerald-700" : ""}`}>
                  {s.valor}
                </p>
              </div>
            ))}
          </div>
        </div>
        {pctMeta !== null && (
          <>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, pctMeta)}%`, backgroundColor: cor }}
              />
            </div>
            {subBarra && <p className="mt-1 text-[11px] text-muted-foreground">{subBarra}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
