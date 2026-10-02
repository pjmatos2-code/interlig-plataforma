import { ExternalLink } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  FAIXAS_FIDELIDADE,
  lerResumoFidelidade,
  linkFidelidadeSgp,
  type FaixaFidelidade,
} from "@/lib/sgp/fidelidade";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { dataHora } from "@/components/comissao/cartao-resultado-agente";
import { cn } from "@/lib/utils";
import { BotaoAtualizarFidelidade } from "./botao";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const COR: Record<FaixaFidelidade, { barra: string; texto: string; fundo: string }> = {
  sem: { barra: "bg-farol-vermelho", texto: "text-farol-vermelho", fundo: "bg-farol-vermelho/10 border-farol-vermelho/30" },
  ate30: { barra: "bg-orange-500", texto: "text-orange-600", fundo: "bg-orange-500/10 border-orange-500/30" },
  ate60: { barra: "bg-amber-400", texto: "text-amber-600", fundo: "bg-amber-400/10 border-amber-400/40" },
  ate90: { barra: "bg-sky-500", texto: "text-sky-600", fundo: "bg-sky-500/10 border-sky-500/30" },
};

const num = (v: number) => v.toLocaleString("pt-BR");

/**
 * Fidelidade da base (01/10/2026) — aba das agentes de refidelização. Cada
 * número abre o relatório Fidelidades do SGP já filtrado na unidade e faixa:
 * a lista nominal (com contrato e plano) mora lá.
 */
export default async function FidelidadePage() {
  await exigirPerfil(["gestor", "direcao", "agente_atendimento"]);
  const [r, { data: cfg }] = await Promise.all([
    lerResumoFidelidade(),
    criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle(),
  ]);
  const baseSgp = String((cfg?.config as Record<string, string> | null)?.base_url ?? "");
  const total = (f: FaixaFidelidade) => r.unidades.reduce((s, u) => s + u.faixas[f], 0);
  const maxLinha = Math.max(1, ...r.unidades.map((u) => FAIXAS_FIDELIDADE.reduce((s, f) => s + u.faixas[f.chave], 0)));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CabecalhoPagina
          titulo="Fidelidade da base"
          descricao="Clientes ativos sem fidelidade e os que perdem a fidelidade nos próximos 90 dias, por unidade. Clique num número para abrir a lista no SGP."
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          <BotaoAtualizarFidelidade />
          <span className="text-xs text-muted-foreground">
            {r.atualizadoEm ? `Dados do SGP de ${dataHora(r.atualizadoEm)} · atualiza sozinho toda madrugada` : "Ainda sem leitura do SGP"}
          </span>
        </div>
      </div>

      {/* totais */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FAIXAS_FIDELIDADE.map((f) => (
          <div key={f.chave} className={cn("rounded-xl border p-4 shadow-sm", COR[f.chave].fundo)}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{f.rotulo}</p>
            <p className={cn("text-3xl font-bold tabular-nums", COR[f.chave].texto)}>{num(total(f.chave))}</p>
            <p className="text-xs text-muted-foreground">
              {f.chave === "sem" ? "inclui fidelidade já vencida" : "ainda com fidelidade — refidelize antes de vencer"}
            </p>
          </div>
        ))}
      </div>

      {/* por unidade */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Unidade</th>
                {FAIXAS_FIDELIDADE.map((f) => (
                  <th key={f.chave} className="px-3 py-3 text-right font-semibold">{f.rotulo}</th>
                ))}
                <th className="min-w-[220px] px-5 py-3 font-semibold">Distribuição</th>
              </tr>
            </thead>
            <tbody>
              {r.unidades.map((u) => {
                const soma = FAIXAS_FIDELIDADE.reduce((s, f) => s + u.faixas[f.chave], 0);
                return (
                  <tr key={u.pop} className="border-b last:border-0">
                    <td className="px-5 py-4 text-base font-semibold">{u.nome}</td>
                    {FAIXAS_FIDELIDADE.map((f) => (
                      <td key={f.chave} className="px-3 py-4 text-right">
                        {baseSgp && u.faixas[f.chave] > 0 ? (
                          <a
                            href={linkFidelidadeSgp(baseSgp, u.pop, f.chave)}
                            target="_blank"
                            rel="noreferrer"
                            title={`Abrir no SGP: ${u.nome} · ${f.rotulo}`}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xl font-bold tabular-nums hover:bg-muted",
                              COR[f.chave].texto
                            )}
                          >
                            {num(u.faixas[f.chave])}
                            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                          </a>
                        ) : (
                          <span className="px-2 text-xl font-bold tabular-nums text-muted-foreground">{num(u.faixas[f.chave])}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      <div className="flex h-3 overflow-hidden rounded-full bg-muted" style={{ width: `${Math.max(8, (soma / maxLinha) * 100)}%` }}>
                        {FAIXAS_FIDELIDADE.map((f) =>
                          u.faixas[f.chave] > 0 ? (
                            <span key={f.chave} className={COR[f.chave].barra} style={{ width: `${(u.faixas[f.chave] / Math.max(1, soma)) * 100}%` }} />
                          ) : null
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-semibold">
                <td className="px-5 py-3">Total</td>
                {FAIXAS_FIDELIDADE.map((f) => (
                  <td key={f.chave} className="px-3 py-3 text-right text-base tabular-nums">{num(total(f.chave))}</td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <p className="rounded-lg border bg-card p-3">
          <b className="text-foreground">Por onde começar:</b> quem vence em até 30 dias ainda tem o desconto da
          fidelidade — refidelizar agora evita que o cliente passe a pagar cheio e procure a concorrência.
        </p>
        <p className="rounded-lg border bg-card p-3">
          <b className="text-foreground">Como abrir a lista:</b> os números abrem o relatório Fidelidades do SGP já
          filtrado (unidade, contratos ativos e a faixa). É preciso estar logada no SGP no navegador.
        </p>
      </div>
    </>
  );
}
