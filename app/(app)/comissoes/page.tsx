import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { carregarPainelComissoes, type AgentePainel } from "@/lib/comissao/painel";
import { filaAprovacao } from "@/lib/comissao/aprovacoes";
import type { ContratoApurado, SituacaoContrato } from "@/lib/comissao/dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { hojeIso, mesAtras, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { Card, CardContent } from "@/components/ui/card";
import { formatarMoeda, formatarMoedaKpi } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const data = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const SITUACAO: Record<SituacaoContrato, { rotulo: string; cls: string; ordem: number }> = {
  pendente_assinatura: { rotulo: "Falta assinatura", cls: "bg-farol-vermelho/15 text-farol-vermelho", ordem: 0 },
  pendente_ativacao: { rotulo: "Aguardando ativação", cls: "bg-farol-amarelo/20 text-yellow-700", ordem: 1 },
  aprovada_gestao: { rotulo: "Liberada pela gestão", cls: "bg-sky-500/15 text-sky-700", ordem: 2 },
  aprovada: { rotulo: "Aprovada", cls: "bg-farol-verde/15 text-farol-verde", ordem: 3 },
  estornada: { rotulo: "Estornada", cls: "bg-muted text-muted-foreground line-through", ordem: 4 },
  nao_conta: { rotulo: "Não conta (erro/duplicidade)", cls: "bg-muted text-muted-foreground", ordem: 5 },
};

const ROTULO_SETOR: Record<string, string> = {
  comercial_interno: "Comercial interno",
  comercial_externo: "Comercial externo",
  corporativo: "Corporativo",
};

function faixaTexto(a: AgentePainel) {
  if (!a.degrau) return null;
  return a.degrau.tipo === "valor_por_venda" ? `${formatarMoeda(a.degrau.valor)}/venda` : `${a.degrau.valor}%`;
}

/** cor do atingimento: verde comissiona, âmbar perto do piso, vermelho longe */
function tom(a: AgentePainel) {
  if (a.degrau) return "verde";
  const piso = a.degraus[0]?.atingimento_min ?? 80;
  return a.atingimento >= piso - 10 ? "ambar" : "vermelho";
}
const COR_TOM = { verde: "bg-farol-verde", ambar: "bg-farol-amarelo", vermelho: "bg-farol-vermelho" } as const;
const TEXTO_TOM = { verde: "text-farol-verde", ambar: "text-yellow-700", vermelho: "text-farol-vermelho" } as const;

export default async function ComissoesPage({ searchParams }: { searchParams: { mes?: string } }) {
  const usuario = await exigirPerfil(["gestor", "direcao"]);
  const atual = primeiroDiaDoMes(hojeIso());
  const opcoes = [mesAtras(atual, 3), mesAtras(atual, 2), mesAtras(atual, 1), atual];
  const pedido = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? `${searchParams.mes}-01` : null;
  // padrão: o mês anterior enquanto o atual ainda não tem metas (início de mês)
  let mes = pedido ?? atual;
  let p = await carregarPainelComissoes(mes);
  if (!pedido && p.agentes.length === 0) {
    mes = mesAtras(atual, 1);
    p = await carregarPainelComissoes(mes);
  }
  const ehGestor = usuario.perfil === "gestor";
  const [linkSgp, fila] = await Promise.all([templateLinkSgp(), ehGestor ? filaAprovacao(mes) : null]);
  const mesParam = mes.slice(0, 7);
  // pendentes por agente — mesma fila da página de aprovação (o número do atalho
  // é o que aparece lá ao clicar)
  const pendPorAgente = new Map<string, { nome: string; aprovaveis: number; assinatura: number }>();
  const estornadas = new Set(p.agentes.flatMap((a) => a.contratos.filter((x) => x.situacao === "estornada").map((x) => x.id)));
  const pendentesFila = (fila?.pendentes ?? []).filter((i) => !estornadas.has(i.contratoId));
  for (const i of pendentesFila) {
    const k = i.vendedorId ?? "sem";
    const g = pendPorAgente.get(k) ?? { nome: i.vendedorId ? i.vendedora : "Sem vendedora", aprovaveis: 0, assinatura: 0 };
    if (i.bloqueioAbsoluto) g.assinatura += 1;
    else g.aprovaveis += 1;
    pendPorAgente.set(k, g);
  }
  const fotoDe = new Map(p.agentes.map((a) => [a.vendedorId, a.foto]));
  const comissaoPresa = p.agentes.reduce((s, a) => s + Math.max(0, a.comissaoSeLiberar - a.comissao), 0);

  const vendedoras = p.agentes.filter((a) => a.base === "proprias");
  const lideranca = p.agentes.filter((a) => a.base !== "proprias");
  const soma = (f: (a: AgentePainel) => number, l = vendedoras) => l.reduce((s, a) => s + f(a), 0);
  const divergentes = p.agentes.filter((a) => a.fechado && Math.abs(a.fechado.valor - a.comissao) >= 0.01);

  return (
    <>
      <CabecalhoPagina
        titulo="Comissões do comercial"
        descricao="Meta, reposição de inadimplentes, vendas, ativações, aprovações e atingimento de cada agente — com a conta e os contratos por trás de cada número."
      />

      {/* mês + estado da apuração */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {opcoes.map((m) => (
          <Link
            key={m}
            href={`/comissoes?mes=${m.slice(0, 7)}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm capitalize",
              m === mes ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {nomeMes(m)}
          </Link>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {p.fechamento ? (
            <span className="rounded-full bg-farol-verde/15 px-2.5 py-1 font-medium text-farol-verde">
              Fechado em {dataHora(p.fechamento.em)}
              {p.fechamento.por ? ` por ${p.fechamento.por}` : ""}
              {p.fechamento.pago ? " · pagamento registrado" : " · aguardando pagamento"}
            </span>
          ) : (
            <span className="rounded-full bg-farol-amarelo/20 px-2.5 py-1 font-medium text-yellow-700">
              {p.emAndamento ? "Em apuração — valores parciais" : "Ainda não fechado"}
            </span>
          )}
          {p.ultimaSync && <span>Dados do SGP de {dataHora(p.ultimaSync)}</span>}
        </span>
      </div>

      {ehGestor && pendentesFila.length > 0 && (
        <section className="mb-5 rounded-xl border border-farol-amarelo/50 bg-farol-amarelo/10 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {pendentesFila.length} venda{pendentesFila.length > 1 ? "s" : ""} aguardando aprovação em {nomeMes(mes)}
            </h2>
            <Link
              href={`/metas/aprovacoes?mes=${mesParam}`}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Aprovar todas as pendentes →
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[...pendPorAgente.values()].reduce((s, g) => s + g.aprovaveis, 0)} você pode liberar agora ·{" "}
            {[...pendPorAgente.values()].reduce((s, g) => s + g.assinatura, 0)} travadas por falta de assinatura
            {comissaoPresa >= 0.01 && <> · {formatarMoeda(comissaoPresa)} de comissão esperando liberação</>}
            {p.fechamento && (
              <span className="block text-yellow-700">
                {nomeMes(mes)} já está fechado: o que for liberado agora só entra no pagamento depois de refazer o fechamento.
              </span>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...pendPorAgente.entries()]
              .sort((a, b) => b[1].aprovaveis + b[1].assinatura - (a[1].aprovaveis + a[1].assinatura))
              .map(([id, g]) => (
                <Link
                  key={id}
                  href={`/metas/aprovacoes?mes=${mesParam}&agente=${id}`}
                  className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 text-sm shadow-sm hover:border-primary hover:bg-primary/5"
                >
                  <AvatarAgente nome={g.nome} foto={fotoDe.get(id) ?? null} tamanho="sm" />
                  <span className="font-medium">{g.nome}</span>
                  {g.aprovaveis > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground" title="você pode liberar">
                      {g.aprovaveis}
                    </span>
                  )}
                  {g.assinatura > 0 && (
                    <span className="rounded-full bg-farol-vermelho/15 px-1.5 text-xs font-semibold text-farol-vermelho" title="falta assinatura">
                      {g.assinatura} 🔒
                    </span>
                  )}
                </Link>
              ))}
          </div>
        </section>
      )}

      {p.agentes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma agente com meta e regra de comissão em {nomeMes(mes)}.{" "}
            <Link href={`/metas?mes=${mes.slice(0, 7)}`} className="font-medium text-primary underline">
              Cadastrar metas do mês →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {divergentes.length > 0 && (
            <div className="mb-5 rounded-lg border border-farol-amarelo/50 bg-farol-amarelo/10 p-3 text-sm">
              <strong>Mudou depois do fechamento:</strong>{" "}
              {divergentes.map((a) => `${a.nome} (fechado ${formatarMoeda(a.fechado!.valor)} · hoje ${formatarMoeda(a.comissao)})`).join("; ")}.
              O financeiro paga o valor fechado; para valer o de hoje, refaça o fechamento em Metas e comissão.
            </div>
          )}

          {/* resumo do time */}
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ["Meta do time", soma((a) => a.meta), "soma das metas individuais"],
              ["Reposição", soma((a) => a.reposicao), "inadimplentes a repor"],
              ["Meta final", soma((a) => a.metaFinal), "meta + reposição"],
              ["Vendidas", soma((a) => a.vendidas), "cadastros que contam"],
              ["Ativas", soma((a) => a.ativas), "das vendas válidas"],
              ["Aprovadas", soma((a) => a.aprovadas), "liberadas para comissão"],
              ["VTV aprovado", formatarMoedaKpi(soma((a) => a.receitaAprovada)), `de ${formatarMoedaKpi(soma((a) => a.vtvVendido))} vendido`],
              ["Comissão", formatarMoedaKpi(soma((a) => a.comissao, p.agentes)), "inclui coordenação"],
            ].map(([r, v, s]) => (
              <Card key={r as string}>
                <CardContent className="p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{r}</p>
                  <p className="whitespace-nowrap text-2xl font-bold tabular-nums">{v}</p>
                  <p className="text-xs text-muted-foreground">{s}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* placar: tudo numa linha por agente */}
          <Card className="mb-6">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Agente</th>
                      <th className="px-2 py-2.5 text-right font-medium">Meta</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Inadimplentes da coorte que a agente precisa repor">+ Reposição</th>
                      <th className="px-2 py-2.5 text-right font-medium">= Meta final</th>
                      <th className="px-2 py-2.5 text-right font-medium">Vendidas</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Vendidas menos estornos — é o que pontua a meta">Válidas</th>
                      <th className="px-2 py-2.5 text-right font-medium">Ativas</th>
                      <th className="px-2 py-2.5 text-right font-medium">Aprovadas</th>
                      <th className="min-w-[180px] px-3 py-2.5 font-medium">Atingimento</th>
                      <th className="px-2 py-2.5 text-right font-medium">Faixa</th>
                      <th className="px-2 py-2.5 text-right font-medium" title="Soma das mensalidades aprovadas — é sobre ela que a faixa incide. Embaixo, o VTV de todas as vendas válidas.">
                        × VTV
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">= Comissão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.agentes.map((a) => {
                      const t = tom(a);
                      return (
                        <tr key={a.vendedorId} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2">
                            <a href={`#ag-${a.vendedorId}`} className="flex items-center gap-2 font-medium hover:underline">
                              <AvatarAgente nome={a.nome} foto={a.foto} tamanho="sm" />
                              {a.nome}
                              {a.base !== "proprias" && (
                                <span className="rounded bg-muted px-1.5 text-[10px] font-normal uppercase text-muted-foreground">coord.</span>
                              )}
                            </a>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.meta}</td>
                          <td className={cn("px-2 py-2 text-right tabular-nums", a.reposicao > 0 && "font-semibold text-farol-vermelho")}>
                            {a.reposicao > 0 ? `+${a.reposicao}` : "0"}
                          </td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums">{a.metaFinal}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.vendidas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.validas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.ativas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{a.aprovadas}</td>
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-2">
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                <span className={cn("block h-full rounded-full", COR_TOM[t])} style={{ width: `${Math.min(100, a.atingimento)}%` }} />
                              </span>
                              <span className={cn("w-14 text-right text-xs font-semibold tabular-nums", TEXTO_TOM[t])}>{pct(a.atingimento)}</span>
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{faixaTexto(a) ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                            {formatarMoeda(a.receitaAprovada)}
                            {a.vtvVendido - a.receitaAprovada >= 0.01 && (
                              <span className="block text-[11px] text-muted-foreground">vendido {formatarMoeda(a.vtvVendido)}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatarMoeda(a.comissao)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {vendedoras.map((a) => (
              <CartaoAgente
                key={a.vendedorId}
                a={a}
                linkSgp={linkSgp}
                debito={p.debito}
                linkAprovar={ehGestor && pendPorAgente.has(a.vendedorId) ? `/metas/aprovacoes?mes=${mesParam}&agente=${a.vendedorId}` : null}
              />
            ))}
            {lideranca.length > 0 && (
              <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Coordenação</h2>
            )}
            {lideranca.map((a) => (
              <CartaoAgente key={a.vendedorId} a={a} linkSgp={linkSgp} debito={p.debito} />
            ))}
          </div>

          {(p.inativasComMeta.length > 0 || p.semMetaOuRegra.length > 0) && (
            <p className="mt-5 text-xs text-muted-foreground">
              {p.inativasComMeta.length > 0 && <>Fora da apuração por estarem inativas: {p.inativasComMeta.join(", ")}. </>}
              {p.semMetaOuRegra.length > 0 && <>Sem meta ou regra no mês: {p.semMetaOuRegra.join(", ")}.</>}
            </p>
          )}
        </>
      )}
    </>
  );
}

function CartaoAgente({
  a,
  linkSgp,
  debito,
  linkAprovar = null,
}: {
  a: AgentePainel;
  linkSgp: string;
  linkAprovar?: string | null;
  debito: { coorte: string; janela: { de: string; ate: string } | null; aplicado: boolean; observacao: string | null };
}) {
  const t = tom(a);
  const lider = a.base !== "proprias";
  const escala = Math.max(130, (a.degraus.at(-1)?.atingimento_min ?? 100) + 15, a.atingimento + 5);
  const pos = (v: number) => `${(Math.min(v, escala) / escala) * 100}%`;
  const pendentes = a.pendAssinatura + a.pendAtivacao;
  const contratos = [...a.contratos].sort(
    (x, y) => SITUACAO[x.situacao].ordem - SITUACAO[y.situacao].ordem || (x.dataVenda < y.dataVenda ? -1 : 1)
  );
  const faixa = faixaTexto(a);
  const fechadoDiverge = a.fechado && Math.abs(a.fechado.valor - a.comissao) >= 0.01;

  return (
    <Card id={`ag-${a.vendedorId}`} className="scroll-mt-20 overflow-hidden">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-center gap-4 border-b px-5 py-4">
        <AvatarAgente nome={a.nome} foto={a.foto} tamanho="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{a.nome}</p>
          <p className="text-sm text-muted-foreground">
            {[a.pop, lider ? (a.base === "equipe" ? "Coordenação · ativações do time" : "Coordenação · ativações da unidade") : ROTULO_SETOR[a.setor ?? ""]]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Comissão</p>
          <p className="text-3xl font-bold tabular-nums">{formatarMoeda(a.comissao)}</p>
          {a.comissaoSeLiberar - a.comissao >= 0.01 && (
            <p className="text-xs text-muted-foreground">
              {formatarMoeda(a.comissaoSeLiberar)} se todas as pendentes forem liberadas
            </p>
          )}
        </div>
      </div>

      <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_1.25fr]">
        {/* coluna 1: meta e números */}
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meta do mês</h3>
            <div className="flex items-end gap-3 text-sm">
              <Numero valor={a.meta} rotulo="meta" />
              <span className="pb-1 text-lg text-muted-foreground">+</span>
              <Numero valor={a.reposicao} rotulo={lider ? "reposição da unidade" : "reposição"} cls={a.reposicao > 0 ? "text-farol-vermelho" : undefined} />
              <span className="pb-1 text-lg text-muted-foreground">=</span>
              <Numero valor={a.metaFinal} rotulo="meta final" cls="text-primary" />
            </div>
            {a.metaFinal > 0 && (
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                <span className="bg-primary/70" style={{ width: `${(a.meta / a.metaFinal) * 100}%` }} />
                {a.reposicao > 0 && <span className="bg-farol-vermelho/70" style={{ width: `${(a.reposicao / a.metaFinal) * 100}%` }} />}
              </div>
            )}
            {a.reposicao > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Reposição = clientes vendidos em {nomeMes(debito.coorte)} que não estão ativos e pagando
                {debito.janela ? ` (vencimentos de ${data(debito.janela.de)} a ${data(debito.janela.ate)})` : ""}
                {a.reposicaoManual ? " · número ajustado pela gestão" : ""}
                {!debito.aplicado ? " · neste mês a reposição não soma na meta" : ""}.
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {lider ? "Base do time" : "Vendas do mês"}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Etapa rotulo={lider ? "Ativações" : "Vendidas"} valor={a.vendidas} nota={a.naoContam ? `${a.naoContam} não contam` : undefined} />
              <Etapa rotulo="Válidas" valor={a.validas} nota={a.estornadas ? `−${a.estornadas} estornada${a.estornadas > 1 ? "s" : ""}` : "pontuam a meta"} />
              <Etapa rotulo="Ativas" valor={a.ativas} nota={a.validas - a.ativas > 0 ? `${a.validas - a.ativas} não ativa${a.validas - a.ativas > 1 ? "s" : ""}` : "todas ativas"} />
              <Etapa
                rotulo="Aprovadas"
                valor={a.aprovadas}
                destaque
                nota={a.aprovadasGestao ? `${a.aprovadasGestao} pela gestão` : "geram comissão"}
              />
            </div>
            {a.desistencias > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {a.desistencias} cliente{a.desistencias > 1 ? "s" : ""} desist{a.desistencias > 1 ? "iram" : "iu"} antes de instalar — conta
                {a.desistencias > 1 ? "m" : ""} na meta, mas não comissiona{a.desistencias > 1 ? "m" : ""} nem vai{a.desistencias > 1 ? "o" : ""} para aprovação.
              </p>
            )}
            {pendentes > 0 && (
              <p className="mt-2 text-xs">
                <span className="font-semibold text-yellow-700">{pendentes} pendente{pendentes > 1 ? "s" : ""}:</span>{" "}
                {[a.pendAssinatura && `${a.pendAssinatura} sem assinatura`, a.pendAtivacao && `${a.pendAtivacao} sem serviço ativo (aguardando, suspenso ou cancelado)`]
                  .filter(Boolean)
                  .join(" · ")}
                <span className="text-muted-foreground"> — contam na meta, só comissionam quando liberadas.</span>
                {linkAprovar && (
                  <Link
                    href={linkAprovar}
                    className="ml-2 inline-block rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground"
                  >
                    Aprovar pendentes →
                  </Link>
                )}
              </p>
            )}
          </section>
        </div>

        {/* coluna 2: atingimento e conta */}
        <div className="space-y-5">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Atingimento</h3>
              <span className={cn("text-2xl font-bold tabular-nums", TEXTO_TOM[t])}>{pct(a.atingimento)}</span>
            </div>
            <div className="relative pb-9 pt-1">
              <div className="h-4 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", COR_TOM[t])} style={{ width: pos(a.atingimento) }} />
              </div>
              {a.degraus.map((d) => (
                <div key={d.atingimento_min} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: pos(d.atingimento_min) }}>
                  <span className="h-6 w-0.5 bg-foreground/60" />
                  <span className="mt-0.5 whitespace-nowrap text-[11px] font-semibold tabular-nums">{d.atingimento_min}%</span>
                  <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                    {d.tipo === "valor_por_venda" ? `${formatarMoeda(d.valor)}/v` : `${d.valor}%`}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm">
              <b className="tabular-nums">{a.validas}</b> válidas ÷ <b className="tabular-nums">{a.metaFinal}</b> da meta final ={" "}
              <b className="tabular-nums">{pct(a.atingimento)}</b>
              {faixa ? (
                <> → faixa de <b>{faixa}</b></>
              ) : (
                <span className="text-farol-vermelho"> → abaixo da faixa mínima</span>
              )}
            </p>
            {a.proximo && (
              <p className="mt-1 text-sm text-muted-foreground">
                {a.proximo.faltam === 1 ? "Falta 1 venda válida" : `Faltam ${a.proximo.faltam} vendas válidas`} para {a.proximo.degrau.atingimento_min}%
                {" "}(faixa de {a.proximo.degrau.tipo === "valor_por_venda" ? `${formatarMoeda(a.proximo.degrau.valor)}/venda` : `${a.proximo.degrau.valor}%`})
              </p>
            )}
          </section>

          <section className="rounded-lg bg-muted/40 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como chegou na comissão</h3>
            {a.degrau ? (
              <p className="text-sm">
                {a.degrau.tipo === "valor_por_venda" ? (
                  <>
                    <b>{a.aprovadas}</b> aprovadas × <b>{formatarMoeda(a.degrau.valor)}</b>
                  </>
                ) : (
                  <>
                    Receita aprovada <b>{formatarMoeda(a.receitaAprovada)}</b> ({a.aprovadas} mensalidades) × <b>{a.degrau.valor}%</b>
                  </>
                )}
                {a.bonusEGatilhos > 0 && <> + bônus {formatarMoeda(a.bonusEGatilhos)}</>} = <b>{formatarMoeda(a.comissao)}</b>
              </p>
            ) : (
              <p className="text-sm">
                Abaixo de {a.degraus[0]?.atingimento_min ?? 80}% da meta final não há comissão — receita aprovada de{" "}
                {formatarMoeda(a.receitaAprovada)} fica sem faixa.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {a.conferido ? (
                <span className="rounded-full bg-farol-verde/15 px-2 py-0.5 font-medium text-farol-verde">✓ Bate com o cálculo oficial</span>
              ) : (
                <span className="rounded-full bg-farol-vermelho/15 px-2 py-0.5 font-medium text-farol-vermelho">⚠ Contagem não bate com o cálculo — avise a TI</span>
              )}
              {a.fechado &&
                (fechadoDiverge ? (
                  <span className="rounded-full bg-farol-amarelo/20 px-2 py-0.5 font-medium text-yellow-700">
                    Fechado: {formatarMoeda(a.fechado.valor)} ({a.fechado.aprovadas} aprovadas) · hoje {formatarMoeda(a.comissao)} ({a.aprovadas})
                  </span>
                ) : (
                  <span className="rounded-full bg-farol-verde/15 px-2 py-0.5 font-medium text-farol-verde">✓ Igual ao fechamento</span>
                ))}
            </div>
          </section>
        </div>
      </CardContent>

      {/* conferência: contratos e inadimplentes */}
      <div className="border-t">
        {contratos.length > 0 && (
          <details className="group border-b last:border-0">
            <summary className="cursor-pointer select-none px-5 py-2.5 text-sm font-medium hover:bg-muted/40">
              Conferir os {contratos.length} contratos {lider ? "da base" : "vendidos"}
            </summary>
            <TabelaContratos contratos={contratos} linkSgp={linkSgp} />
          </details>
        )}
        {a.inadimplentes.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer select-none px-5 py-2.5 text-sm font-medium hover:bg-muted/40">
              Conferir os {a.inadimplentes.length} inadimplentes da reposição
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Venda</th>
                    <th className="px-3 py-2 font-medium">Situação hoje</th>
                    <th className="px-3 py-2 font-medium">1ª, 2ª e 3ª faturas</th>
                  </tr>
                </thead>
                <tbody>
                  {a.inadimplentes.map((i, k) => {
                    const link = aplicarLinkSgp(linkSgp, { clienteId: i.sgpClienteId, contratoId: i.sgpContratoId });
                    return (
                      <tr key={`${i.sgpContratoId}-${k}`} className="border-b last:border-0">
                        <td className="px-5 py-1.5 tabular-nums">
                          {link ? (
                            <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">#{i.sgpContratoId}</a>
                          ) : (
                            `#${i.sgpContratoId ?? "—"}`
                          )}
                        </td>
                        <td className="px-3 py-1.5">{i.cliente}</td>
                        <td className="px-3 py-1.5 tabular-nums">{data(i.dataVenda)}</td>
                        <td className="px-3 py-1.5 capitalize">{i.status.replace(/_/g, " ")}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex gap-1.5">
                            {i.faturas.map((f) => (
                              <span
                                key={f.parcela}
                                title={`${f.parcela}ª fatura · ${f.situacao.replace("_", " ")}${f.vencimento ? ` · venc. ${data(f.vencimento)}` : ""}`}
                                className={cn(
                                  "rounded px-1.5 text-[11px] font-medium",
                                  f.situacao === "paga"
                                    ? "bg-farol-verde/15 text-farol-verde"
                                    : f.situacao === "atrasada"
                                      ? "bg-farol-vermelho/15 text-farol-vermelho"
                                      : "bg-muted text-muted-foreground"
                                )}
                              >
                                {f.parcela}ª {f.situacao === "paga" ? "paga" : f.situacao === "atrasada" ? "atrasada" : "a vencer"}
                              </span>
                            ))}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}

function Numero({ valor, rotulo, cls }: { valor: number; rotulo: string; cls?: string }) {
  return (
    <span className="flex flex-col">
      <span className={cn("text-2xl font-bold leading-none tabular-nums", cls)}>{valor}</span>
      <span className="mt-1 text-xs text-muted-foreground">{rotulo}</span>
    </span>
  );
}

function Etapa({ rotulo, valor, nota, destaque }: { rotulo: string; valor: number; nota?: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", destaque && "border-farol-verde/40 bg-farol-verde/5")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-2xl font-bold leading-tight tabular-nums">{valor}</p>
      {nota && <p className="truncate text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function TabelaContratos({ contratos, linkSgp }: { contratos: ContratoApurado[]; linkSgp: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <th className="px-5 py-2 font-medium">Contrato</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Plano</th>
            <th className="px-3 py-2 font-medium">Venda</th>
            <th className="px-3 py-2 font-medium">Ativação</th>
            <th className="px-3 py-2 text-right font-medium">Mensalidade</th>
            <th className="px-3 py-2 font-medium">Situação</th>
            <th className="px-3 py-2 font-medium">Observação</th>
          </tr>
        </thead>
        <tbody>
          {contratos.map((c) => {
            const link = aplicarLinkSgp(linkSgp, { clienteId: c.sgpClienteId, contratoId: c.sgpContratoId });
            const s = SITUACAO[c.situacao];
            // sem serviço ativo: diz o status real (suspenso/cancelado ≠ aguardando)
            const rotulo =
              c.situacao === "pendente_ativacao"
                ? c.status === "suspenso"
                  ? "Suspenso"
                  : c.status === "cancelado"
                    ? "Cancelado"
                    : s.rotulo
                : s.rotulo;
            const obs = [
              ...(c.situacao === "aprovada" ? [] : c.pendencias),
              c.desistencia ? "cliente desistiu" : null,
              c.aprovacao ? `liberada: ${c.aprovacao.motivo}${c.aprovacao.aprovadoPor ? ` (${c.aprovacao.aprovadoPor})` : ""}` : null,
            ].filter(Boolean);
            return (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-5 py-1.5 tabular-nums">
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">#{c.sgpContratoId}</a>
                  ) : (
                    `#${c.sgpContratoId ?? "—"}`
                  )}
                </td>
                <td className="max-w-[220px] truncate px-3 py-1.5">{c.cliente}</td>
                <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground">{c.plano ?? "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{data(c.dataVenda)}</td>
                <td className="px-3 py-1.5 tabular-nums">{data(c.dataAtivacao)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatarMoeda(c.valor)}</td>
                <td className="px-3 py-1.5">
                  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", s.cls)}>{rotulo}</span>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{obs.join(" · ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
