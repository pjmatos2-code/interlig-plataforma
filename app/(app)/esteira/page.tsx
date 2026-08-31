import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { ehVendedora } from "@/lib/tipos";
import { resolverPeriodo } from "@/lib/datas";
import { carregarEsteira } from "@/lib/esteira/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { ColunaKanban } from "@/components/esteira/coluna-kanban";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda, formatarNumero, formatarPercentual } from "@/lib/format";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";

export const dynamic = "force-dynamic";

function TabelaTempos({
  titulo,
  linhas,
}: {
  titulo: string;
  linhas: { nome: string; dias: number; ativacoes: number }[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 text-right font-medium">Ativações</th>
              <th className="px-3 py-2 text-right font-medium">Tempo médio</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-b last:border-0">
                <td className="px-4 py-2">{l.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarNumero(l.ativacoes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.dias.toFixed(1).replace(".", ",")} dias
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                  Nenhuma ativação no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default async function EsteiraPage({
  searchParams,
}: {
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string; q?: string; tudo?: string };
}) {
  const usuario = await exigirPerfil([
    "gestor",
    "supervisor",
    "vendedora",
    "vendedora_externa",
    "agente_corporativo",
  ]);
  const periodo = resolverPeriodo(searchParams);
  const ehVend = ehVendedora(usuario.perfil);
  // RLS escopa por perfil: vendedora vê os contratos dela; coordenador vê os das
  // agentes dele (podem cruzar POPs — migração 0025). O filtro de POP é do gestor.
  const popFiltro = searchParams.pop || null;

  const supabase = criarClienteServidor();
  const { data: pops } = ehVend
    ? { data: [] as { id: string; nome: string }[] }
    : await supabase.from("pops").select("id, nome").order("nome");

  // o kanban inteiro reflete o período filtrado; "?tudo=1" mostra o estoque
  // completo (as pendências antigas continuam a um clique de distância)
  const verTudo = searchParams.tudo === "1";
  const [d, linkTemplate] = await Promise.all([
    carregarEsteira(periodo, popFiltro, verTudo),
    templateLinkSgp(),
  ]);
  const ehGestorSemFiltro = usuario.perfil === "gestor" && !popFiltro;

  // busca por nome do cliente ou nº do contrato (filtra o kanban e as listas)
  const busca = (searchParams.q ?? "").trim();
  if (busca) {
    const semAcento = (x: string) =>
      x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const b = semAcento(busca);
    const bDig = busca.replace(/\D/g, "");
    const casa = (i: { cliente: string; sgpContratoId: string | null }) =>
      semAcento(i.cliente).includes(b) ||
      (bDig !== "" && (i.sgpContratoId ?? "").includes(bDig));
    d.colunas.pendenteAssinatura = d.colunas.pendenteAssinatura.filter(casa);
    d.colunas.aguardandoInstalacao = d.colunas.aguardandoInstalacao.filter(casa);
    d.colunas.instaladas = d.colunas.instaladas.filter(casa);
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Esteira de ativação"
        descricao={
          busca
            ? `Filtrando por "${busca}" — limpe a busca para ver tudo`
            : verTudo
              ? "Estoque completo — todas as pendências, de qualquer data de venda"
              : `Vendas de ${formatarData(periodo.de)} a ${formatarData(periodo.ate)} — as três colunas seguem esse período`
        }
      />

      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <FiltrosDashboard
          pops={pops ?? []}
          mostrarPop={usuario.perfil === "gestor"}
          de={periodo.de}
          ate={periodo.ate}
        />
        <form method="get" className="mb-5 flex items-center gap-2">
          {searchParams.periodo && <input type="hidden" name="periodo" value={searchParams.periodo} />}
          {searchParams.de && <input type="hidden" name="de" value={searchParams.de} />}
          {searchParams.ate && <input type="hidden" name="ate" value={searchParams.ate} />}
          {searchParams.pop && <input type="hidden" name="pop" value={searchParams.pop} />}
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar cliente ou nº do contrato"
            className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button className="h-10 rounded-md border px-3 text-sm font-medium hover:border-interlig-ceu">
            Buscar
          </button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Pendentes de assinatura"
          valor={formatarNumero(d.kpis.pendentesAssinatura.total)}
          contexto={
            d.kpis.pendentesAssinatura.emAlerta > 0
              ? `${d.kpis.pendentesAssinatura.emAlerta} há 48h ou mais (5.8)`
              : "nenhum em alerta"
          }
          tom={d.kpis.pendentesAssinatura.emAlerta > 0 ? "vermelho" : "verde"}
        />
        <CartaoKpi
          rotulo="Aguardando instalação"
          valor={formatarNumero(d.kpis.aguardandoInstalacao.total)}
          contexto={
            d.kpis.aguardandoInstalacao.emAlerta > 0
              ? `${d.kpis.aguardandoInstalacao.emAlerta} há mais de 7 dias (5.7)`
              : "nenhum em alerta"
          }
          tom={d.kpis.aguardandoInstalacao.emAlerta > 0 ? "vermelho" : "verde"}
        />
        <CartaoKpi
          rotulo="Taxa de instalação efetiva"
          valor={
            d.kpis.taxaInstalacao.taxa === null
              ? "—"
              : formatarPercentual(d.kpis.taxaInstalacao.taxa, 0)
          }
          contexto={
            d.kpis.taxaInstalacao.taxa === null
              ? "nenhuma venda com janela de 15 dias fechada"
              : `${d.kpis.taxaInstalacao.instaladas} de ${d.kpis.taxaInstalacao.base} em ≤ 15 dias (5.9)`
          }
        />
        <CartaoKpi
          rotulo="Tempo médio venda → ativação"
          valor={
            d.kpis.tempoMedioDias === null
              ? "—"
              : `${d.kpis.tempoMedioDias.toFixed(1).replace(".", ",")} dias`
          }
          contexto={`${formatarNumero(d.kpis.instaladasNoPeriodo)} ativações no período`}
        />
      </div>

      {!verTudo && (d.foraDoPeriodo.assinatura > 0 || d.foraDoPeriodo.instalacao > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 px-4 py-3">
          <p className="text-sm text-amber-900">
            ⚠ Fora deste período há{" "}
            <strong>
              {d.foraDoPeriodo.assinatura > 0 && `${d.foraDoPeriodo.assinatura} sem assinar`}
              {d.foraDoPeriodo.assinatura > 0 && d.foraDoPeriodo.instalacao > 0 && " e "}
              {d.foraDoPeriodo.instalacao > 0 && `${d.foraDoPeriodo.instalacao} aguardando instalação`}
            </strong>{" "}
            de vendas mais antigas — geralmente os casos mais críticos.
          </p>
          <Link
            href={{ query: { ...searchParams, tudo: "1" } }}
            className="ml-auto rounded-md border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Ver todas as pendências →
          </Link>
        </div>
      )}
      {verTudo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            Mostrando <strong>todas as pendências</strong>, de qualquer data de venda.
          </p>
          <Link
            href={{ query: { ...searchParams, tudo: undefined } }}
            className="ml-auto rounded-md border px-3 py-1.5 text-sm font-medium hover:border-interlig-ceu"
          >
            ← Voltar ao período filtrado
          </Link>
        </div>
      )}

      {/* Kanban da esteira: vendida → assinatura → instalação → instalada */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <ColunaKanban
          titulo="Pendente de assinatura"
          descricaoIdade="idade desde a venda · vermelho a partir de 48h"
          itens={d.colunas.pendenteAssinatura}
          tom="amarelo"
          mostrarPop={ehGestorSemFiltro}
          linkTemplate={linkTemplate}
          podeDesistir={usuario.perfil === "gestor"}
        />
        <ColunaKanban
          titulo="Aguardando instalação"
          descricaoIdade="idade desde a assinatura · vermelho após 7 dias"
          itens={d.colunas.aguardandoInstalacao}
          tom="azul"
          mostrarPop={ehGestorSemFiltro}
          linkTemplate={linkTemplate}
          podeDesistir={usuario.perfil === "gestor"}
        />
        <ColunaKanban
          titulo="Instaladas no período"
          descricaoIdade="idade = dias entre venda e ativação"
          itens={d.colunas.instaladas}
          tom="verde"
          mostrarPop={ehGestorSemFiltro}
          linkTemplate={linkTemplate}
        />
      </div>

      {/* Assinaturas pendentes: resumo por vendedor + lista com ID clicável no SGP */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        {!ehVend && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Assinaturas pendentes por vendedora</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Vendedora</th>
                  <th className="px-3 py-2 text-right font-medium">Pendentes</th>
                  <th className="px-3 py-2 text-right font-medium">Em alerta (48h+)</th>
                </tr>
              </thead>
              <tbody>
                {d.assinaturaPorVendedora.map((v) => (
                  <tr key={v.vendedora} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{v.vendedora}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarNumero(v.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {v.emAlerta > 0 ? (
                        <Badge variant="vermelho">{v.emAlerta}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                ))}
                {d.assinaturaPorVendedora.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhuma assinatura pendente 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        )}

        <Card className={ehVend ? "xl:col-span-3" : "xl:col-span-2"}>
          <CardHeader className="pb-2">
            <CardTitle>Cadastros com assinatura pendente</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Contrato</th>
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Vendedora</th>
                    {ehGestorSemFiltro && <th className="px-3 py-2 font-medium">POP</th>}
                    <th className="px-3 py-2 text-right font-medium">Idade</th>
                  </tr>
                </thead>
                <tbody>
                  {d.colunas.pendenteAssinatura.map((i) => {
                    const link = aplicarLinkSgp(linkTemplate, {
                      clienteId: i.sgpClienteId,
                      contratoId: i.sgpContratoId,
                      cpf: i.cpf,
                    });
                    return (
                      <tr
                        key={i.id}
                        className={i.alerta ? "border-b bg-farol-vermelho/5 last:border-0" : "border-b last:border-0"}
                      >
                        <td className="px-4 py-2 font-mono text-xs">
                          {i.sgpContratoId && link ? (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-interlig-ceu hover:underline"
                              title="Abrir contrato no SGP"
                            >
                              #{i.sgpContratoId}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              {i.cliente}
                            </a>
                          ) : (
                            i.cliente
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{i.vendedora}</td>
                        {ehGestorSemFiltro && <td className="px-3 py-2 text-muted-foreground">{i.pop}</td>}
                        <td className="px-3 py-2 text-right tabular-nums">
                          {i.alerta ? (
                            <span className="text-farol-vermelho">{i.idadeDias} d</span>
                          ) : (
                            `${i.idadeDias} d`
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {d.colunas.pendenteAssinatura.length === 0 && (
                    <tr>
                      <td colSpan={ehGestorSemFiltro ? 5 : 4} className="px-4 py-6 text-center text-muted-foreground">
                        Nenhum cadastro com assinatura pendente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {!ehVend && (
        <div className="grid gap-4 xl:grid-cols-2">
          <TabelaTempos titulo="Tempo médio por POP" linhas={d.tempoPorPop} />
          <TabelaTempos titulo="Tempo médio por vendedora" linhas={d.tempoPorVendedora} />
        </div>
      )}
    </>
  );
}
