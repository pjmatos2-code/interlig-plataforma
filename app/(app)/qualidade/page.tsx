import { exigirPerfil } from "@/lib/auth";
import { carregarQualidade, type LinhaTaxa } from "@/lib/qualidade/dados";
import { criarClienteServidor } from "@/lib/supabase/server";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { GraficoSafras } from "@/components/qualidade/grafico-safras";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarNumero, formatarPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Faróis de referência: churn precoce e inadimplência (quanto menor, melhor). */
const LIMITES = { churnAtencao: 0.05, churnCritico: 0.1, inadAtencao: 0.05, inadCritico: 0.1 };

function tomTaxa(taxa: number | null, atencao: number, critico: number) {
  if (taxa === null) return undefined;
  if (taxa >= critico) return "vermelho" as const;
  if (taxa >= atencao) return "amarelo" as const;
  return "verde" as const;
}

function TabelaTaxas({
  titulo,
  linhas,
  rotuloCasos,
  atencao,
  critico,
}: {
  titulo: string;
  linhas: LinhaTaxa[];
  rotuloCasos: string;
  atencao: number;
  critico: number;
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
              <th className="px-3 py-2 text-right font-medium">{rotuloCasos}</th>
              <th className="px-3 py-2 text-right font-medium">Base</th>
              <th className="px-3 py-2 text-right font-medium">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-b last:border-0">
                <td className="px-4 py-2">{l.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatarNumero(l.casos)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatarNumero(l.base)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right font-medium tabular-nums",
                    l.taxa !== null && l.taxa >= critico && "text-farol-vermelho",
                    l.taxa !== null && l.taxa >= atencao && l.taxa < critico && "text-yellow-600",
                    l.taxa !== null && l.taxa < atencao && "text-farol-verde"
                  )}
                >
                  {l.taxa === null ? "—" : formatarPercentual(l.taxa, 1)}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  Sem base suficiente ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default async function QualidadePage({
  searchParams,
}: {
  searchParams: { pop?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "supervisor"]);
  const popFiltro = usuario.perfil === "supervisor" ? usuario.pop_id : searchParams.pop || null;

  const supabase = criarClienteServidor();
  const { data: pops } = await supabase.from("pops").select("id, nome").order("nome");
  const d = await carregarQualidade(popFiltro);

  return (
    <>
      <CabecalhoPagina
        titulo="Qualidade da venda"
        descricao="Safra = mês de ativação · janelas fechadas: churn julga 90 dias, inadimplência julga vencimento + 10"
      />

      {usuario.perfil === "gestor" && (
        <form className="mb-5" method="get">
          <select
            name="pop"
            defaultValue={searchParams.pop ?? ""}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Filtrar por POP"
          >
            <option value="">Todas as POPs</option>
            {(pops ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <button className="ml-2 h-9 rounded-md border px-3 text-sm hover:bg-accent" type="submit">
            Aplicar
          </button>
        </form>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Churn precoce (90d)"
          valor={d.churn.geral.taxa === null ? "—" : formatarPercentual(d.churn.geral.taxa, 1)}
          contexto={`${d.churn.geral.cancelados} de ${formatarNumero(d.churn.geral.base)} ativados (5.10)`}
          tom={tomTaxa(d.churn.geral.taxa, LIMITES.churnAtencao, LIMITES.churnCritico)}
        />
        <CartaoKpi
          rotulo="Inadimplência de 1ª fatura"
          valor={
            d.inadimplencia.geral.taxa === null
              ? "—"
              : formatarPercentual(d.inadimplencia.geral.taxa, 1)
          }
          contexto={`${d.inadimplencia.geral.inadimplentes} de ${formatarNumero(d.inadimplencia.geral.base)} primeiras faturas (5.11)`}
          tom={tomTaxa(d.inadimplencia.geral.taxa, LIMITES.inadAtencao, LIMITES.inadCritico)}
        />
        <CartaoKpi
          rotulo="Pior origem (churn)"
          valor={d.churn.porOrigem[0]?.nome ?? "—"}
          contexto={
            d.churn.porOrigem[0]
              ? `${formatarPercentual(d.churn.porOrigem[0].taxa ?? 0, 1)} de churn precoce`
              : ""
          }
        />
        <CartaoKpi
          rotulo="Pior origem (inadimplência)"
          valor={d.inadimplencia.porOrigem[0]?.nome ?? "—"}
          contexto={
            d.inadimplencia.porOrigem[0]
              ? `${formatarPercentual(d.inadimplencia.porOrigem[0].taxa ?? 0, 1)} sem pagar a 1ª`
              : ""
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Churn precoce por safra</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoSafras
              dados={d.churn.porSafra.map((s) => ({
                safra: s.safra,
                taxa: s.taxa,
                base: s.base,
                casos: s.cancelados,
              }))}
              rotuloCasos="cancelados"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Só safras com a janela de 90 dias totalmente fechada (regra 5.10).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Inadimplência de 1ª fatura por safra</CardTitle>
          </CardHeader>
          <CardContent>
            <GraficoSafras
              dados={d.inadimplencia.porSafra.map((s) => ({
                safra: s.safra,
                taxa: s.taxa,
                base: s.base,
                casos: s.inadimplentes,
              }))}
              rotuloCasos="inadimplentes"
            />
          </CardContent>
        </Card>

        <TabelaTaxas
          titulo="Churn precoce por origem"
          linhas={d.churn.porOrigem}
          rotuloCasos="Cancelados"
          atencao={LIMITES.churnAtencao}
          critico={LIMITES.churnCritico}
        />
        <TabelaTaxas
          titulo="Inadimplência por origem"
          linhas={d.inadimplencia.porOrigem}
          rotuloCasos="Inadimplentes"
          atencao={LIMITES.inadAtencao}
          critico={LIMITES.inadCritico}
        />
        {!popFiltro && (
          <TabelaTaxas
            titulo="Churn precoce por POP"
            linhas={d.churn.porPop}
            rotuloCasos="Cancelados"
            atencao={LIMITES.churnAtencao}
            critico={LIMITES.churnCritico}
          />
        )}

        <Card className={popFiltro ? "xl:col-span-2" : ""}>
          <CardHeader className="pb-2">
            <CardTitle>Vendas × churn precoce por vendedora</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Vendedora</th>
                  <th className="px-3 py-2 text-right font-medium">Ativados (base)</th>
                  <th className="px-3 py-2 text-right font-medium">Cancelados ≤ 90d</th>
                  <th className="px-3 py-2 text-right font-medium">Churn</th>
                  <th className="px-3 py-2 text-center font-medium">Leitura</th>
                </tr>
              </thead>
              <tbody>
                {d.churn.cruzamento.map((l) => {
                  const alto = (l.churn.taxa ?? 0) >= LIMITES.churnCritico;
                  const volume = l.churn.base >= 20;
                  return (
                    <tr key={l.vendedora} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{l.vendedora}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.churn.base}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.churn.cancelados}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-medium tabular-nums",
                          alto ? "text-farol-vermelho" : "text-farol-verde"
                        )}
                      >
                        {l.churn.taxa === null ? "—" : formatarPercentual(l.churn.taxa, 1)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {alto && volume ? (
                          <Badge variant="vermelho">volume com qualidade baixa</Badge>
                        ) : alto ? (
                          <Badge variant="amarelo">observar</Badge>
                        ) : (
                          <Badge variant="verde">saudável</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {d.churn.cruzamento.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      Sem base suficiente ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
