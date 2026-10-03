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
import { redirect } from "next/navigation";
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
export default async function FidelidadePage({
  searchParams,
}: {
  searchParams: { unidade?: string; faixa?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "direcao", "agente_atendimento", "supervisor"]);
  const [resumo, { data: cfg }, { data: pops }] = await Promise.all([
    lerResumoFidelidade(),
    criarClienteAdmin().from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle(),
    criarClienteAdmin().from("pops").select("id, nome"),
  ]);
  // coordenação de unidade (Brasil Novo, Vitória do Xingu) vê só a própria
  // base; a coordenação de Altamira cuida de equipes e não acessa
  let unidadeFixa: string | null = null;
  if (usuario.perfil === "supervisor") {
    const nomePop = String((pops ?? []).find((x) => x.id === usuario.pop_id)?.nome ?? "");
    if (!["Brasil Novo", "Vitória do Xingu"].includes(nomePop)) redirect("/dashboard");
    unidadeFixa = nomePop;
  }
  const r = unidadeFixa ? { ...resumo, unidades: resumo.unidades.filter((u) => u.nome === unidadeFixa) } : resumo;
  const baseSgp = String((cfg?.config as Record<string, string> | null)?.base_url ?? "");
  const total = (f: FaixaFidelidade) => r.unidades.reduce((s, u) => s + u.faixas[f], 0);
  const maxLinha = Math.max(1, ...r.unidades.map((u) => FAIXAS_FIDELIDADE.reduce((s, f) => s + u.faixas[f.chave], 0)));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CabecalhoPagina
          titulo={unidadeFixa ? `Fidelidade da base · ${unidadeFixa}` : "Fidelidade da base"}
          descricao={`Clientes ativos sem fidelidade e os que perdem a fidelidade nos próximos 90 dias${unidadeFixa ? "" : ", por unidade"}. Clique num número para abrir a lista no SGP.`}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          {!unidadeFixa && <BotaoAtualizarFidelidade />}
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
                        {u.excluidos[f.chave] > 0 && (
                          <span
                            className="block pr-2 text-[11px] text-muted-foreground"
                            title="Permutas, isentos e órgãos públicos: ficam fora da contagem, mas o SGP ainda os lista"
                          >
                            +{num(u.excluidos[f.chave])} fora da contagem
                          </span>
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

      <GraficoPlanos
        unidades={r.unidades}
        unidadeSel={unidadeFixa ? null : searchParams.unidade ?? null}
        faixaSel={(FAIXAS_FIDELIDADE.find((f) => f.chave === searchParams.faixa)?.chave ?? "sem") as FaixaFidelidade}
        podeTrocarUnidade={!unidadeFixa}
      />

      <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
        <p className="rounded-lg border bg-card p-3">
          <b className="text-foreground">Por onde começar:</b> quem vence em até 30 dias ainda tem o desconto da
          fidelidade — refidelizar agora evita que o cliente passe a pagar cheio e procure a concorrência.
        </p>
        <p className="rounded-lg border bg-card p-3">
          <b className="text-foreground">Como abrir a lista:</b> os números abrem o relatório Fidelidades do SGP já
          filtrado (unidade, contratos ativos e a faixa). É preciso estar logada no SGP no navegador.
        </p>
        <p className="rounded-lg border bg-card p-3 md:col-span-2">
          <b className="text-foreground">Fora da contagem:</b> permutas, isentos (mensalidade zero, cortesia, controle
          interno) e órgãos públicos (prefeituras, fundos e secretarias municipais) não entram nos números da
          plataforma. O filtro do SGP não consegue tirá-los, então a lista que abre lá mostra esses contratos a mais —
          pule-os no contato.
        </p>
      </div>
    </>
  );
}

/** grupos que não são internet residencial/corporativa ganham cor neutra */
const ESPECIAIS = /Rede neutra|LigChip|Telefonia|Interlig Play|Desativado|não identificado|Lan To Lan/i;

function GraficoPlanos({
  unidades,
  unidadeSel,
  faixaSel,
  podeTrocarUnidade,
}: {
  unidades: { pop: number; nome: string; planos: Record<FaixaFidelidade, Record<string, number>> }[];
  unidadeSel: string | null;
  faixaSel: FaixaFidelidade;
  podeTrocarUnidade: boolean;
}) {
  const escopo = unidadeSel ? unidades.filter((u) => String(u.pop) === unidadeSel) : unidades;
  const soma = new Map<string, number>();
  for (const u of escopo) for (const [plano, n] of Object.entries(u.planos[faixaSel] ?? {})) soma.set(plano, (soma.get(plano) ?? 0) + n);
  const ordenado = [...soma.entries()].sort((a, b) => b[1] - a[1]);
  const LIMITE = 14;
  const barras = ordenado.slice(0, LIMITE);
  const resto = ordenado.slice(LIMITE);
  if (resto.length) barras.push([`Outros ${resto.length} planos`, resto.reduce((t, [, n]) => t + n, 0)]);
  const total = ordenado.reduce((t, [, n]) => t + n, 0);
  const max = Math.max(1, ...barras.map(([, n]) => n));
  const href = (u: string | null, f: string) => {
    const q = new URLSearchParams();
    if (u) q.set("unidade", u);
    if (f !== "sem") q.set("faixa", f);
    const qs = q.toString();
    return `/fidelidade${qs ? `?${qs}` : ""}#planos`;
  };
  const chip = (ativo: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium",
      ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
    );
  const rotuloFaixa = FAIXAS_FIDELIDADE.find((f) => f.chave === faixaSel)?.rotulo ?? "";

  return (
    <section id="planos" className="mt-5 scroll-mt-20 rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Planos dos clientes · {rotuloFaixa.toLowerCase()}</h2>
          <p className="text-sm text-muted-foreground">
            {num(total)} contratos ativos por plano (velocidade e residencial × corporativo){unidadeSel ? "" : podeTrocarUnidade ? " · todas as unidades" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {podeTrocarUnidade && (
            <div className="flex flex-wrap justify-end gap-1.5">
              <a href={href(null, faixaSel)} className={chip(!unidadeSel)}>Todas</a>
              {unidades.map((u) => (
                <a key={u.pop} href={href(String(u.pop), faixaSel)} className={chip(unidadeSel === String(u.pop))}>{u.nome}</a>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-1.5">
            {FAIXAS_FIDELIDADE.map((f) => (
              <a key={f.chave} href={href(unidadeSel, f.chave)} className={chip(faixaSel === f.chave)}>{f.rotulo}</a>
            ))}
          </div>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum contrato nesta seleção.</p>
      ) : (
        <div className="space-y-2">
          {barras.map(([plano, n]) => {
            const corp = /corporativo/i.test(plano);
            const especial = ESPECIAIS.test(plano) || plano.startsWith("Outros ");
            return (
              <div key={plano} className="flex items-center gap-3">
                <span className="w-44 shrink-0 truncate text-sm" title={plano}>{plano}</span>
                <div className="h-6 flex-1 rounded-md bg-muted/60">
                  <div
                    className={cn("flex h-full items-center rounded-md", corp ? "bg-violet-500" : especial ? "bg-slate-400" : "bg-sky-500")}
                    style={{ width: `${Math.max(1.5, (n / max) * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-sm font-bold tabular-nums">{num(n)}</span>
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{Math.round((n / total) * 100)}%</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> residencial</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> corporativo (corporate, PJ, dedicado)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> outros serviços (rede neutra, LigChip, telefonia, Play)</span>
      </div>
    </section>
  );
}
