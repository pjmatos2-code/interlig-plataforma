import { exigirPerfil } from "@/lib/auth";
import { resolverPeriodo } from "@/lib/datas";
import { carregarEsteira } from "@/lib/esteira/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { FiltrosDashboard } from "@/components/dashboard/filtros";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { ColunaKanban } from "@/components/esteira/coluna-kanban";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarNumero, formatarPercentual } from "@/lib/format";

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
  searchParams: { periodo?: string; de?: string; ate?: string; pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const periodo = resolverPeriodo(searchParams);
  const popFiltro = usuario.perfil === "supervisor" ? usuario.pop_id : searchParams.pop || null;

  const supabase = criarClienteServidor();
  const { data: pops } = await supabase.from("pops").select("id, nome").order("nome");

  const d = await carregarEsteira(periodo, popFiltro);
  const ehGestorSemFiltro = usuario.perfil === "gestor" && !popFiltro;

  return (
    <>
      <CabecalhoPagina
        titulo="Esteira de ativação"
        descricao={`Pendências mostram o estoque atual · taxa e tempos seguem o período ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`}
      />

      <FiltrosDashboard
        pops={pops ?? []}
        mostrarPop={usuario.perfil === "gestor"}
        de={periodo.de}
        ate={periodo.ate}
      />

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

      {/* Kanban da esteira: vendida → assinatura → instalação → instalada */}
      <div className="mb-6 grid gap-3 lg:grid-cols-3">
        <ColunaKanban
          titulo="Pendente de assinatura"
          descricaoIdade="idade desde a venda · vermelho a partir de 48h"
          itens={d.colunas.pendenteAssinatura}
          tom="amarelo"
          mostrarPop={ehGestorSemFiltro}
        />
        <ColunaKanban
          titulo="Aguardando instalação"
          descricaoIdade="idade desde a assinatura · vermelho após 7 dias"
          itens={d.colunas.aguardandoInstalacao}
          tom="azul"
          mostrarPop={ehGestorSemFiltro}
        />
        <ColunaKanban
          titulo="Instaladas no período"
          descricaoIdade="idade = dias entre venda e ativação"
          itens={d.colunas.instaladas}
          tom="verde"
          mostrarPop={ehGestorSemFiltro}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TabelaTempos titulo="Tempo médio por POP" linhas={d.tempoPorPop} />
        <TabelaTempos titulo="Tempo médio por vendedora" linhas={d.tempoPorVendedora} />
      </div>
    </>
  );
}
