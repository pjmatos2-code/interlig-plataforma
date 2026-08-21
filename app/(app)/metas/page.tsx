import { exigirUsuario } from "@/lib/auth";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeIso, primeiroDiaDoMes, ultimoDiaDoMes, mesAtras } from "@/lib/datas";
import {
  vendasDoPeriodo,
  percentualMeta,
  pace,
  metaDiariaIndividual,
  type ContratoIndicador,
} from "@/lib/indicadores/regras";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { comissoesDoMes } from "@/lib/comissao/dados";
import { SimuladorComissao } from "@/components/comissao/simulador";
import { PainelFechamento } from "@/components/comissao/fechamento";
import { formatarMoeda } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioMeta, BotaoExcluirMeta } from "./formulario";
import { formatarNumero, formatarPercentual } from "@/lib/format";

export const dynamic = "force-dynamic";

const ROTULO_ESCOPO = { global: "Global", pop: "POP", vendedora: "Vendedora" } as const;

export default async function MetasPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const usuario = await exigirUsuario();
  const supabase = criarClienteServidor();

  const hoje = hojeIso();
  const mesAtual = primeiroDiaDoMes(hoje);
  const mesSelecionado = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : mesAtual;

  const [{ data: metas }, { data: pops }, { data: vendedoras }, { data: cal }] =
    await Promise.all([
      supabase
        .from("metas")
        .select("id, escopo, referencia_id, mes_ano, quantidade_vendas")
        .eq("mes_ano", mesSelecionado)
        .order("escopo"),
      supabase.from("pops").select("id, nome").order("nome"),
      supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
      supabase
        .from("calendario")
        .select("data, dia_util")
        .gte("data", mesSelecionado)
        .lte("data", ultimoDiaDoMes(mesSelecionado)),
    ]);

  const diasUteisMes = (cal ?? []).filter((d) => d.dia_util).length;
  const nomes = new Map<string, string>([
    ...(pops ?? []).map((p) => [p.id, p.nome] as [string, string]),
    ...(vendedoras ?? []).map((v) => [v.id, v.nome] as [string, string]),
  ]);

  // ---------- visão da própria meta (vendedora, e supervisor com vínculo) ----------
  let minhaMeta: {
    quantidade: number;
    vendasMes: number;
    percentual: number;
    pace: number;
    metaDiaria: number;
  } | null = null;

  if (usuario.vendedor_id) {
    const [{ data: metaPropria }, { data: contratosProprios }, { data: calAtual }] =
      await Promise.all([
        supabase
          .from("metas")
          .select("quantidade_vendas")
          .eq("escopo", "vendedora")
          .eq("referencia_id", usuario.vendedor_id)
          .eq("mes_ano", mesAtual)
          .maybeSingle(),
        supabase
          .from("contratos")
          .select(
            "data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, status, valor_mensalidade"
          )
          .eq("vendedor_id", usuario.vendedor_id)
          .gte("data_venda", mesAtual),
        supabase
          .from("calendario")
          .select("data, dia_util")
          .gte("data", mesAtual)
          .lte("data", ultimoDiaDoMes(hoje)),
      ]);

    if (metaPropria) {
      const uteis = (calAtual ?? []).filter((d) => d.dia_util).map((d) => d.data as string);
      const vendasMes = vendasDoPeriodo(
        (contratosProprios ?? []) as ContratoIndicador[],
        mesAtual,
        hoje
      ).length;
      minhaMeta = {
        quantidade: metaPropria.quantidade_vendas,
        vendasMes,
        percentual: percentualMeta(vendasMes, metaPropria.quantidade_vendas),
        pace: pace(
          metaPropria.quantidade_vendas,
          vendasMes,
          uteis.filter((d) => d >= hoje).length
        ),
        metaDiaria: metaDiariaIndividual(metaPropria.quantidade_vendas, uteis.length),
      };
    }
  }

  const ehGestor = usuario.perfil === "gestor";
  const mesInput = mesSelecionado.slice(0, 7);

  // ---------- comissões (PRD seção 6) ----------
  const comissoes = await comissoesDoMes(mesAtual);
  const minhaComissao = usuario.vendedor_id
    ? comissoes.find((c) => c.vendedorId === usuario.vendedor_id) ?? null
    : null;
  const mesAnterior = mesAtras(mesAtual, 1);
  const { data: fechadas } = await supabase
    .from("comissoes_fechadas")
    .select("vendedor_id, mes_ano, valor_total, fechado_em, vendedores(nome)")
    .order("mes_ano", { ascending: false })
    .limit(50);
  const fechamentoMesAnterior = (fechadas ?? []).some((f) => f.mes_ano === mesAnterior);

  return (
    <>
      <CabecalhoPagina
        titulo="Metas e comissão"
        descricao={
          ehGestor
            ? "Cadastro de metas por vendedora, POP e global. Meta diária e semanal são derivadas dos dias úteis."
            : "Sua meta do mês e o ritmo necessário para bater."
        }
      />

      {minhaMeta && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <CartaoKpi
            rotulo="Minha meta do mês"
            valor={formatarNumero(minhaMeta.quantidade)}
            contexto={`${minhaMeta.metaDiaria.toFixed(1).replace(".", ",")}/dia útil`}
          />
          <CartaoKpi rotulo="Vendi até hoje" valor={formatarNumero(minhaMeta.vendasMes)} />
          <CartaoKpi rotulo="% da meta" valor={formatarPercentual(minhaMeta.percentual, 0)} />
          <CartaoKpi
            rotulo="Pace"
            valor={
              minhaMeta.pace === 0 ? "batida 🎉" : `${minhaMeta.pace.toFixed(1).replace(".", ",")}/dia`
            }
            contexto="o que falta ÷ dias úteis restantes"
          />
        </div>
      )}

      {minhaComissao?.entradaSimulador && (
        <div className="mb-6">
          <SimuladorComissao entrada={minhaComissao.entradaSimulador} />
        </div>
      )}

      {(ehGestor || usuario.perfil === "supervisor") && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>Comissão do time — mês corrente (estimativa)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Vendedora</th>
                    <th className="px-3 py-2.5 text-right font-medium">Vendas válidas</th>
                    <th className="px-3 py-2.5 text-right font-medium">Atingimento</th>
                    <th className="px-3 py-2.5 text-right font-medium">Degrau</th>
                    <th className="px-3 py-2.5 text-right font-medium">Estornos</th>
                    <th className="px-3 py-2.5 text-right font-medium">Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => (
                    <tr key={c.vendedorId} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">{c.nome}</td>
                      {c.resultado ? (
                        <>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.resultado.vendasComissionaveis}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.resultado.atingimentoPct.toFixed(0)}%
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {c.resultado.degrau
                              ? c.resultado.degrau.tipo === "valor_por_venda"
                                ? `${formatarMoeda(c.resultado.degrau.valor)}/venda`
                                : `${c.resultado.degrau.valor}% da receita`
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {c.resultado.estornos > 0 ? (
                              <Badge variant="vermelho">{c.resultado.estornos}</Badge>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                            {formatarMoeda(c.resultado.total)}
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3 py-2.5 text-right text-xs text-muted-foreground">
                          {c.metaMensal === null ? "sem meta cadastrada" : "sem regra de comissão vigente"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {comissoes.some((c) => c.resultado) && (
                  <tfoot>
                    <tr className="bg-muted/30 text-sm font-semibold">
                      <td className="px-4 py-2.5">Total do time</td>
                      <td colSpan={4} />
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatarMoeda(
                          comissoes.reduce((s, c) => s + (c.resultado?.total ?? 0), 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {ehGestor && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>Fechamento de comissões (snapshot imutável)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PainelFechamento mesAnterior={mesAnterior} jaFechado={fechamentoMesAnterior} />
            {(fechadas ?? []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Mês</th>
                      <th className="px-3 py-2 font-medium">Vendedora</th>
                      <th className="px-3 py-2 text-right font-medium">Valor fechado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fechadas ?? []).map((f) => (
                      <tr key={`${f.vendedor_id}-${f.mes_ano}`} className="border-b last:border-0">
                        <td className="px-4 py-2 tabular-nums">
                          {String(f.mes_ano).slice(0, 7).split("-").reverse().join("/")}
                        </td>
                        <td className="px-3 py-2">
                          {(f.vendedores as unknown as { nome: string } | null)?.nome ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                          {formatarMoeda(Number(f.valor_total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ehGestor && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle>Nova meta / atualizar existente</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioMeta
              pops={pops ?? []}
              vendedoras={vendedoras ?? []}
              mesPadrao={mesAtual.slice(0, 7)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle>Metas de {mesInput.split("-").reverse().join("/")}</CardTitle>
          <form className="flex items-center gap-2" method="get">
            <input
              type="month"
              name="mes"
              defaultValue={mesInput}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Mês das metas"
            />
            <button className="h-9 rounded-md border px-3 text-sm hover:bg-accent" type="submit">
              Ver mês
            </button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Escopo</th>
                  <th className="px-3 py-2.5 font-medium">Referência</th>
                  <th className="px-3 py-2.5 text-right font-medium">Meta mensal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Meta diária derivada</th>
                  {ehGestor && <th className="px-3 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {(metas ?? []).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">{ROTULO_ESCOPO[m.escopo as keyof typeof ROTULO_ESCOPO]}</td>
                    <td className="px-3 py-2.5">
                      {m.escopo === "global"
                        ? "Toda a operação"
                        : nomes.get(m.referencia_id as string) ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatarNumero(m.quantidade_vendas)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {diasUteisMes > 0
                        ? `${metaDiariaIndividual(m.quantidade_vendas, diasUteisMes)
                            .toFixed(1)
                            .replace(".", ",")}/dia útil`
                        : "—"}
                    </td>
                    {ehGestor && (
                      <td className="px-3 py-2.5 text-right">
                        <BotaoExcluirMeta id={m.id} />
                      </td>
                    )}
                  </tr>
                ))}
                {(metas ?? []).length === 0 && (
                  <tr>
                    <td colSpan={ehGestor ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhuma meta cadastrada para este mês.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Regra de comissão vigente: degraus e gatilhos parametrizados no banco (regras_comissao),
        estorno casado com o churn precoce. Edição de regras pela tela entra com o Admin completo.
      </p>
    </>
  );
}
