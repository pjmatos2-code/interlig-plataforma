import { exigirUsuario } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarDashboard } from "@/lib/dashboard/dados";
import { carregarRanking } from "@/lib/ranking/dados";
import { LogoInterlig } from "@/components/marca/logo-interlig";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AtualizadorTv } from "./atualizador";

export const dynamic = "force-dynamic";

const MEDALHAS = ["🥇", "🥈", "🥉"];

/** Modo TV (PRD 3.3): fullscreen para o telão da sala comercial, refresh 60s. */
export default async function TvPage() {
  const usuario = await exigirUsuario();
  const periodo = resolverPeriodo({ periodo: "mes" });
  const popEscopo = usuario.perfil === "supervisor" ? usuario.pop_id : null;

  const [d, ranking] = await Promise.all([
    carregarDashboard(periodo, popEscopo),
    carregarRanking(popEscopo),
  ]);

  const vendasHoje = d.vendasDiarias[d.vendasDiarias.length - 1]?.vendas ?? 0;
  const pct = d.metaMensal ? d.percentualMeta : 0;

  return (
    <main className="min-h-screen bg-interlig-marinho p-8 text-white">
      <header className="mb-8 flex items-center justify-between">
        <LogoInterlig variante="clara" tamanho="md" />
        <div className="text-right">
          <p className="text-3xl font-semibold">
            <AtualizadorTv />
          </p>
          <p className="text-sm text-white/60">{formatarData(d.hoje)} · atualiza a cada 60s</p>
        </div>
      </header>

      {/* progresso da meta do mês */}
      <section className="mb-8 rounded-2xl bg-white/5 p-6">
        <div className="mb-3 flex items-end justify-between">
          <p className="text-xl text-white/80">Meta do mês</p>
          <p className="text-5xl font-bold tabular-nums">
            {formatarNumero(d.vendasMes)}
            <span className="text-2xl font-normal text-white/60">
              {" "}
              / {d.metaMensal ? formatarNumero(d.metaMensal) : "—"} vendas
            </span>
          </p>
        </div>
        <div className="h-6 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              d.farol === "verde" && "bg-farol-verde",
              d.farol === "amarelo" && "bg-farol-amarelo",
              d.farol === "vermelho" && "bg-farol-vermelho"
            )}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-3 text-lg text-white/80">
          <span>{formatarPercentual(pct, 0)} da meta</span>
          <span>
            pace:{" "}
            <strong className="text-white">
              {d.paceNecessario > 0
                ? `${d.paceNecessario.toFixed(1).replace(".", ",")}/dia útil`
                : "meta batida 🎉"}
            </strong>
          </span>
          <span>
            projeção:{" "}
            <strong
              className={cn(
                d.farol === "verde" && "text-farol-verde",
                d.farol === "amarelo" && "text-farol-amarelo",
                d.farol === "vermelho" && "text-farol-vermelho"
              )}
            >
              {formatarNumero(Math.round(d.projecao))} vendas
            </strong>
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* hoje */}
        <section className="rounded-2xl bg-white/5 p-6">
          <p className="text-lg text-white/70">Hoje</p>
          <p className="mt-2 text-7xl font-bold tabular-nums">{formatarNumero(vendasHoje)}</p>
          <p className="mt-1 text-white/60">venda(s) até agora</p>
          <hr className="my-4 border-white/10" />
          <p className="text-lg text-white/70">Receita do mês</p>
          <p className="text-3xl font-semibold tabular-nums">{formatarMoeda(d.receitaPeriodo)}</p>
        </section>

        {/* pódio do mês */}
        <section className="rounded-2xl bg-white/5 p-6">
          <p className="mb-4 text-lg text-white/70">Pódio do mês</p>
          <div className="space-y-3">
            {ranking.podios.mes.slice(0, 3).map((l, i) => (
              <div
                key={l.vendedorId}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3",
                  i === 0 ? "bg-farol-amarelo/20" : "bg-white/5"
                )}
              >
                <span className="text-3xl">{MEDALHAS[i]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-semibold">{l.nome}</p>
                  <p className="text-sm text-white/60">{l.pop}</p>
                </div>
                <p className="text-3xl font-bold tabular-nums">{formatarNumero(l.vendas)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* pódio do dia + streaks */}
        <section className="rounded-2xl bg-white/5 p-6">
          <p className="mb-4 text-lg text-white/70">Pódio do dia</p>
          <div className="space-y-2">
            {ranking.podios.dia.filter((l) => l.vendas > 0).slice(0, 3).map((l, i) => (
              <div key={l.vendedorId} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-2">
                <span className="text-xl">{MEDALHAS[i]}</span>
                <p className="min-w-0 flex-1 truncate font-medium">{l.nome}</p>
                <p className="text-xl font-bold tabular-nums">{formatarNumero(l.vendas)}</p>
              </div>
            ))}
            {ranking.podios.dia.every((l) => l.vendas === 0) && (
              <p className="py-4 text-center text-white/50">O dia ainda está aberto — bora! 🚀</p>
            )}
          </div>
          <hr className="my-4 border-white/10" />
          <p className="mb-2 text-lg text-white/70">Sequências 🔥</p>
          {ranking.streaks.filter((s) => s.streak > 0).slice(0, 3).map((s) => (
            <p key={s.vendedorId} className="text-white/90">
              🔥 <strong>{s.nome}</strong> — {s.streak} dia(s) batendo a meta
            </p>
          ))}
          {ranking.streaks.every((s) => s.streak === 0) && (
            <p className="text-white/50">nenhuma sequência ativa</p>
          )}
        </section>
      </div>
    </main>
  );
}
