import { exigirUsuario } from "@/lib/auth";
import { carregarRanking, type LinhaRanking } from "@/lib/ranking/dados";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MEDALHAS = ["🥇", "🥈", "🥉"];

function Podio({
  titulo,
  linhas,
  mostrarValores,
  destacarId,
}: {
  titulo: string;
  linhas: LinhaRanking[];
  mostrarValores: boolean;
  destacarId: string | null;
}) {
  const zerado = linhas.every((l) => l.vendas === 0);
  const top3 = zerado ? [] : linhas.slice(0, 3).filter((l) => l.vendas > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {top3.map((l, i) => (
          <div
            key={l.vendedorId}
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2",
              i === 0 && "border-farol-amarelo/60 bg-farol-amarelo/10",
              l.vendedorId === destacarId && "ring-2 ring-interlig-ceu"
            )}
          >
            <span className="text-xl">{MEDALHAS[i]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{l.pop}</p>
            </div>
            {mostrarValores && (
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatarNumero(l.vendas)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatarMoeda(l.receita)}
                </p>
              </div>
            )}
          </div>
        ))}
        {top3.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Ainda sem vendas neste recorte.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function RankingPage() {
  const usuario = await exigirUsuario();
  const ehVendedora = usuario.perfil === "vendedora";
  const popEscopo = usuario.perfil === "supervisor" ? usuario.pop_id : null;

  const d = await carregarRanking(popEscopo);
  const meuId = usuario.vendedor_id;

  // posição da vendedora logada + distância para a posição acima (PRD 3.3)
  const minhaLinha = (linhas: LinhaRanking[]) => linhas.find((l) => l.vendedorId === meuId);
  const posicaoCard = (rotulo: string, linhas: LinhaRanking[]) => {
    const minha = minhaLinha(linhas);
    if (!minha) return null;
    const acima = linhas.find((l) => l.posicao === minha.posicao - 1);
    const faltam = acima ? acima.vendas - minha.vendas + 1 : 0;
    return { rotulo, posicao: minha.posicao, total: linhas.length, vendas: minha.vendas, faltam };
  };
  const minhasPosicoes = ehVendedora
    ? [
        posicaoCard("Hoje", d.podios.dia),
        posicaoCard("Semana", d.podios.semana),
        posicaoCard("Mês", d.podios.mes),
      ].filter(Boolean)
    : [];

  const meuStreak = d.streaks.find((s) => s.vendedorId === meuId);

  return (
    <>
      <CabecalhoPagina
        titulo="Ranking"
        descricao={
          ehVendedora
            ? "Sua posição e sua sequência — os números das colegas não aparecem aqui."
            : usuario.perfil === "supervisor"
              ? "Pódios, sequências e badges do seu time."
              : "Pódios, sequências e badges de toda a operação."
        }
      />

      <a
        href="/tv/ranking"
        target="_blank"
        className="mb-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-interlig-azul to-interlig-ceu px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
      >
        📺 Abrir modo Totem (TV vertical) →
      </a>

      {/* visão da vendedora: posição + distância, sem valores das colegas */}
      {ehVendedora && minhasPosicoes.length > 0 && (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {minhasPosicoes.map((p) => (
            <Card key={p!.rotulo} className={cn(p!.posicao === 1 && "border-farol-amarelo/70")}>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">{p!.rotulo}</p>
                <p className="mt-1 text-2xl font-semibold">
                  {p!.vendas === 0 ? "—" : p!.posicao === 1 ? "🥇 1ª" : `${p!.posicao}ª`}
                  {p!.vendas > 0 && (
                    <span className="text-sm font-normal text-muted-foreground"> de {p!.total}</span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p!.vendas === 0
                    ? "ainda sem vendas neste recorte"
                    : p!.posicao === 1
                      ? `líder com ${formatarNumero(p!.vendas)} venda(s) 🎉`
                      : `faltam ${p!.faltam} venda(s) para alcançar a ${p!.posicao - 1}ª posição`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {ehVendedora && meuStreak && (
        <Card className="mb-5 border-interlig-ceu/40">
          <CardContent className="flex items-center gap-4 p-4">
            <span className="text-3xl">🔥</span>
            <div>
              <p className="font-semibold">
                {meuStreak.streak === 0
                  ? "Sem sequência ativa"
                  : `${meuStreak.streak} dia(s) útil(eis) seguidos batendo a meta diária`}
              </p>
              <p className="text-xs text-muted-foreground">
                Meta diária: {meuStreak.metaDiaria.toFixed(1).replace(".", ",")} venda(s)/dia útil
                (regra 5.13)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* pódios */}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Podio titulo="Pódio do dia" linhas={d.podios.dia} mostrarValores={!ehVendedora} destacarId={meuId} />
        <Podio titulo="Pódio da semana" linhas={d.podios.semana} mostrarValores={!ehVendedora} destacarId={meuId} />
        <Podio titulo="Pódio do mês" linhas={d.podios.mes} mostrarValores={!ehVendedora} destacarId={meuId} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* badges do mês */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Badges do mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="text-xl">🏅</span>
              <div>
                <p className="font-medium">Primeira a bater a meta do mês</p>
                <p className="text-muted-foreground">
                  {d.badges.primeiraMeta
                    ? `${d.badges.primeiraMeta.nome} — em ${formatarData(d.badges.primeiraMeta.dia)}`
                    : "ainda em disputa 👀"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">💎</span>
              <div>
                <p className="font-medium">Maior ticket médio</p>
                <p className="text-muted-foreground">
                  {d.badges.maiorTicket
                    ? `${d.badges.maiorTicket.nome} — ${ehVendedora ? "na liderança" : formatarMoeda(d.badges.maiorTicket.valor)}`
                    : "mínimo de 5 vendas no mês"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">🎯</span>
              <div>
                <p className="font-medium">Melhor conversão real (CRM)</p>
                <p className="text-muted-foreground">
                  {d.badges.melhorConversao
                    ? `${d.badges.melhorConversao.nome} — ${ehVendedora ? "na liderança" : formatarPercentual(d.badges.melhorConversao.taxa, 0)}`
                    : "mínimo de 5 tickets fechados no mês"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-xl">🚀</span>
              <div>
                <p className="font-medium">Recorde pessoal em andamento</p>
                {d.badges.recordePessoal.length === 0 ? (
                  <p className="text-muted-foreground">ninguém superou o próprio recorde ainda</p>
                ) : (
                  <p className="text-muted-foreground">
                    {d.badges.recordePessoal
                      .map((r) =>
                        ehVendedora
                          ? r.nome
                          : `${r.nome} (${r.vendas} vs ${r.recordeAnterior})`
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* streaks */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Sequências (streak de meta diária)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Vendedora</th>
                  <th className="px-3 py-2 text-right font-medium">Meta diária</th>
                  <th className="px-3 py-2 text-right font-medium">Streak</th>
                </tr>
              </thead>
              <tbody>
                {d.streaks.map((s) => (
                  <tr
                    key={s.vendedorId}
                    className={cn(
                      "border-b last:border-0",
                      s.vendedorId === meuId && "bg-interlig-ceu/5 font-medium"
                    )}
                  >
                    <td className="px-4 py-2">
                      {s.nome}
                      {s.vendedorId === meuId && " (você)"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {ehVendedora && s.vendedorId !== meuId
                        ? "—"
                        : `${s.metaDiaria.toFixed(1).replace(".", ",")}/dia`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.streak > 0 ? `🔥 ${s.streak}` : "0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
