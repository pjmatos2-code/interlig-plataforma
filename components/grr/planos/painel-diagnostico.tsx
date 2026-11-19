import Link from "next/link";
import { ClipboardList, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CartaoGrr } from "@/lib/grr/montar";
import { situacaoExibida, type Diagnostico, type Plano } from "@/lib/grr/planos";
import { ROTULO_STATUS, SELO_STATUS } from "@/components/grr/painel/icones";
import { FormDiagnostico, FormPlano } from "./formularios";
import { SeloAprovacao, SeloSituacao } from "./selos";

const dataHora = (iso: string) => {
  const d = new Date(Date.parse(iso) - 3 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}`;
};

/**
 * Diagnóstico dos desvios (Etapa 3): para cada indicador em atenção ou crítico
 * no recorte da tela, o diagnóstico da coordenação (causa, evidências,
 * providências e solução), as versões anteriores e os planos de ação ligados.
 */
export function PainelDiagnostico({
  desvios,
  versoes,
  planos,
  contexto,
  podeEscrever,
  responsaveis,
  nomes,
  hoje,
}: {
  desvios: CartaoGrr[];
  /** todas as versões dos diagnósticos do recorte e da semana */
  versoes: Diagnostico[];
  planos: Plano[];
  contexto: { semana: string; recorte: string };
  podeEscrever: boolean;
  responsaveis: { id: string; nome: string }[];
  nomes: Map<string, string>;
  hoje: string;
}) {
  if (!desvios.length) return null;
  return (
    <section className="space-y-3" aria-labelledby="t-diagnostico">
      <h2 id="t-diagnostico" className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Stethoscope className="h-5 w-5 text-interlig-azul" aria-hidden /> Diagnóstico dos desvios
      </h2>
      {desvios.map((c) => {
        const doIndicador = versoes.filter((d) => d.indicador === c.chave).sort((a, b) => b.versao - a.versao);
        const atual = doIndicador[0] ?? null;
        const seusPlanos = planos.filter((p) => p.indicador === c.chave);
        return (
          <article key={c.chave} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{c.rotulo}</h3>
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", SELO_STATUS[c.status])}>{ROTULO_STATUS[c.status]}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {c.valor}
                {c.meta ? ` · ${c.meta}` : ""}
              </span>
            </div>

            {atual ? (
              <div className="mt-3 space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Versão {atual.versao} · {(atual.criado_por && nomes.get(atual.criado_por)) || "—"} · {dataHora(atual.criado_em)}
                </p>
                <p><b>Causa:</b> {atual.causa}</p>
                <p><b>Evidências:</b> {atual.evidencias || <span className="text-amber-700">sem evidência registrada (a causa é hipótese)</span>}</p>
                {atual.providencias && <p><b>Providências já tomadas:</b> {atual.providencias}</p>}
                {atual.solucao && <p><b>Solução proposta:</b> {atual.solucao}</p>}
                {doIndicador.length > 1 && (
                  <details className="pt-1 text-xs">
                    <summary className="cursor-pointer font-medium text-interlig-azul">Versões anteriores ({doIndicador.length - 1})</summary>
                    <ul className="mt-2 space-y-2">
                      {doIndicador.slice(1).map((d) => (
                        <li key={d.id} className="border-l-2 pl-2">
                          Versão {d.versao} · {(d.criado_por && nomes.get(d.criado_por)) || "—"} · {dataHora(d.criado_em)}: {d.causa}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-amber-800">Sem diagnóstico para este recorte e semana.</p>
            )}

            {podeEscrever && (
              <details className="mt-3" open={!atual}>
                <summary className="cursor-pointer text-sm font-medium text-interlig-azul">{atual ? "Atualizar diagnóstico (nova versão)" : "Registrar diagnóstico"}</summary>
                <div className="mt-3">
                  <FormDiagnostico
                    contexto={contexto}
                    indicador={c.chave}
                    inicial={atual ? { causa: atual.causa, evidencias: atual.evidencias ?? "", providencias: atual.providencias ?? "", solucao: atual.solucao ?? "" } : undefined}
                  />
                </div>
              </details>
            )}

            <div className="mt-4 border-t pt-3">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <ClipboardList className="h-4 w-4 text-interlig-azul" aria-hidden /> Planos de ação deste indicador ({seusPlanos.length})
              </p>
              {seusPlanos.length > 0 && (
                <ul className="mb-2 space-y-1.5">
                  {seusPlanos.map((p) => (
                    <li key={p.id}>
                      <Link href={`/grr/planos/${p.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:border-interlig-ceu">
                        <span className="min-w-0 flex-1">{p.descricao}</span>
                        <SeloAprovacao a={p.aprovacao} />
                        <SeloSituacao s={situacaoExibida(p, hoje)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {podeEscrever && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-interlig-azul">Propor plano de ação</summary>
                  <div className="mt-3">
                    <FormPlano contexto={contexto} indicador={c.chave} diagnosticoId={atual?.id ?? null} responsaveis={responsaveis} />
                  </div>
                </details>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
