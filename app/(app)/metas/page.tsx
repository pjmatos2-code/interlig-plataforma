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
        Regras de comissão, simulador e fechamento com snapshot entram na Fase 3 (PRD seção 6).
      </p>
    </>
  );
}
