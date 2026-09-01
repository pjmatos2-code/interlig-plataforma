import { exigirPerfil } from "@/lib/auth";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda } from "@/lib/format";
import {
  overrideDoMes,
  PCT_POR_NIVEL,
  NOME_NIVEL,
  EIXOS_RETENCAO,
  type Pilar,
} from "@/lib/gerencia/dados";

export const dynamic = "force-dynamic";

/**
 * Módulo Gerência — Comissionamento da Gestão Comercial (override).
 * Instrução Geral Ago/2026, Seção 6 · v1.1. Tela 100% derivada dos
 * lançamentos validados dos três setores; nada é digitado aqui.
 */

const COR_PILAR: Record<Pilar["chave"], string> = {
  vendas: "#2563eb",
  refidelizacao: "#d97706",
  retencao: "#059669",
};

function BarraNiveis({ p }: { p: Pilar }) {
  // marcas de faixa: 60/80/100/120% (ou eixos absolutos da retenção)
  const pct =
    p.atingimentoPct !== null
      ? Math.min(100, (p.atingimentoPct / 140) * 100)
      : Math.min(100, (p.volume / (EIXOS_RETENCAO[3] + 5)) * 100);
  const marcas =
    p.atingimentoPct !== null
      ? [60, 80, 100, 120].map((m) => ({ rotulo: `${m}%`, pos: (m / 140) * 100 }))
      : EIXOS_RETENCAO.map((e) => ({ rotulo: String(e), pos: (e / (EIXOS_RETENCAO[3] + 5)) * 100 }));
  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: COR_PILAR[p.chave] }}
        />
        {marcas.map((m) => (
          <span
            key={m.rotulo}
            className="absolute top-0 h-full w-px bg-background/80"
            style={{ left: `${m.pos}%` }}
          />
        ))}
      </div>
      <div className="relative mt-0.5 h-4">
        {marcas.map((m) => (
          <span
            key={m.rotulo}
            className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
            style={{ left: `${m.pos}%` }}
          >
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChipNivel({ nivel }: { nivel: number }) {
  const cls =
    nivel === 0
      ? "bg-rose-100 text-rose-800"
      : nivel === 4
        ? "bg-emerald-100 text-emerald-800"
        : "bg-sky-100 text-sky-800";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      N{nivel} · {NOME_NIVEL[nivel].toUpperCase()}
    </span>
  );
}

export default async function GerenciaPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  await exigirPerfil(["gestor", "financeiro"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());
  const d = await overrideDoMes(mes);
  const mesBr = (() => {
    const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    return `${meses[Number(d.competencia.slice(5, 7)) - 1]}/${d.competencia.slice(0, 4)}`;
  })();
  const ordinal = { vendas: "1º", refidelizacao: "2º", retencao: "3º" } as const;

  return (
    <>
      <CabecalhoPagina
        titulo="Gerência — Comissionamento da Gestão"
        descricao={`Override sobre a base global dos três pilares · trava pelo menor pilar · ${d.regra}`}
      />

      {/* competência + flags */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form method="get" className="flex items-end gap-2">
          <input
            type="month"
            name="mes"
            defaultValue={d.competencia.slice(0, 7)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            Aplicar
          </button>
        </form>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${d.flags.earlyChurn ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
          Early churn: {d.flags.earlyChurn ? "ON" : "OFF (migração)"}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${d.flags.clawback ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-sky-300 bg-sky-50 text-sky-800"}`}>
          Clawback: {d.flags.clawback ? "ON" : "OFF (migração)"}
        </span>
        <span className="text-xs text-muted-foreground">Competência: {mesBr} · dados validados da plataforma</span>
      </div>

      {d.bloqueado && (
        <Card className="mb-4 border-rose-300">
          <CardContent className="p-4 text-sm text-rose-800">⛔ {d.bloqueado}</CardContent>
        </Card>
      )}

      {/* pilares */}
      <div className="mb-4 grid gap-3 xl:grid-cols-3">
        {d.pilares.map((p) => {
          const limitante = d.pilarLimitante?.chave === p.chave && d.nivelFinal < 4;
          return (
            <Card key={p.chave} className={limitante ? "border-amber-400 ring-1 ring-amber-400" : ""}>
              <CardHeader className="pb-2">
                {limitante && (
                  <span className="mb-1 w-fit rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                    👑 PILAR LIMITANTE DO MÊS
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    <span className="text-muted-foreground">{ordinal[p.chave]} pilar</span> · {p.rotulo.toUpperCase()}
                  </CardTitle>
                  <ChipNivel nivel={p.nivel} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-3xl font-bold tabular-nums">
                  {p.volume}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    {p.meta !== null ? `/ ${p.meta} ${p.chave === "refidelizacao" ? "planos" : "vendas"}` : "retenções válidas"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.atingimentoPct !== null
                    ? `Atingimento: ${p.atingimentoPct.toFixed(1).replace(".", ",")}% · meta ${p.meta}`
                    : `Faixa absoluta v2.0 · escala ${EIXOS_RETENCAO.join(" / ")}`}
                </p>
                <BarraNiveis p={p} />
                {p.nivel < 4 && p.faltamProximo !== null && (
                  <p className="text-xs">
                    Próximo nível (N{p.nivel + 1}):{" "}
                    <strong style={{ color: COR_PILAR[p.chave] }}>
                      faltam {p.faltamProximo} {p.chave === "vendas" ? "vendas" : p.chave === "refidelizacao" ? "planos" : "retenções"}
                    </strong>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* trava + escada */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Como funciona a trava</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-1.5 text-xs">
              {d.pilares.map((p) => (
                <span key={p.chave} className="rounded-md border px-2 py-1.5 text-center">
                  <span className="block text-[10px] text-muted-foreground">{p.rotulo}</span>
                  <strong>N{p.nivel}</strong>
                </span>
              ))}
              <span className="text-muted-foreground">→</span>
              <span className="rounded-md border px-2 py-1.5 text-center">
                <span className="block text-[10px] text-muted-foreground">menor pilar</span>
                <strong>N{d.nivelFinal}</strong>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-md bg-slate-900 px-2.5 py-1.5 text-center text-white">
                <span className="block text-[10px] opacity-70">override</span>
                <strong>{d.overridePct.toFixed(1).replace(".", ",")}%</strong>
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Escada de níveis</CardTitle></CardHeader>
            <CardContent className="p-0 pb-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase text-muted-foreground">
                    <th className="px-4 py-1.5">Nível</th>
                    <th className="px-2 py-1.5">Vendas / Refi</th>
                    <th className="px-2 py-1.5">Retenção</th>
                    <th className="px-2 py-1.5 text-right">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["N1 · Mínimo", "60–80%", "16–20", 1],
                    ["N2 · Básico", "81–100%", "21–24", 2],
                    ["N3 · Meta", "101–120%", "25–28", 3],
                    ["N4 · Desafio", ">121%", "29+", 4],
                  ].map(([r, vr, ret, n]) => (
                    <tr key={String(r)} className={`border-b last:border-0 ${d.nivelFinal === n ? "bg-sky-50 font-semibold" : ""}`}>
                      <td className="px-4 py-1.5">{r}{d.nivelFinal === n && " ← mês atual"}</td>
                      <td className="px-2 py-1.5 tabular-nums">{vr}</td>
                      <td className="px-2 py-1.5 tabular-nums">{ret}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{PCT_POR_NIVEL[n as number].toFixed(1).replace(".", ",")}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        {/* base global */}
        <Card className="self-start">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Base global do mês (R$)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["🛒 VTV Vendas Novas — todas as unidades", d.base.vtvVendas],
              ["🔄 VTV Refidelização", d.base.vtvRefi],
              ["🛡 VTV Retido", d.base.vtvRetido],
              ["📶 LIGCHIP — todas as unidades", d.base.vtvLigchip],
            ].map(([r, v]) => (
              <div key={String(r)} className="flex items-baseline justify-between border-b pb-1.5 last:border-0">
                <span className="text-muted-foreground">{r}</span>
                <strong className="tabular-nums">{formatarMoeda(v as number)}</strong>
              </div>
            ))}
            <div className="flex items-baseline justify-between rounded-md bg-muted/60 px-3 py-2">
              <strong>BASE GLOBAL TOTAL</strong>
              <strong className="tabular-nums text-primary">{formatarMoeda(d.base.total)}</strong>
            </div>
            <p className="text-[11px] text-muted-foreground">
              LIGCHIP compõe o valor, mas não conta no volume dos pilares.
              {d.flags.earlyChurn && d.debitoEarlyChurn > 0 && ` · Débito early churn: −${d.debitoEarlyChurn} no volume de vendas.`}
            </p>
          </CardContent>
        </Card>

        {/* comissão */}
        <Card className="self-start border-slate-800 bg-slate-900 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200">💰 Comissão da gestão — {mesBr}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-4xl font-bold tabular-nums">{formatarMoeda(d.comissao)}</p>
            <p className="text-xs text-slate-300">
              {formatarMoeda(d.base.total)} × {d.overridePct.toFixed(1).replace(".", ",")}% (nível N{d.nivelFinal})
              {d.pilarLimitante && d.nivelFinal < 4 && (
                <> · definido pelo pilar limitante: <strong className="text-amber-300">{d.pilarLimitante.rotulo}</strong></>
              )}
            </p>
            {d.oportunidade && (
              <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
                <p className="font-semibold text-amber-300">⭐ Oportunidade:</p>
                <p className="mt-0.5 text-slate-200">
                  +{d.oportunidade.faltam} {d.oportunidade.unidade} elevam todo o mês a{" "}
                  {d.oportunidade.novoPct.toFixed(1).replace(".", ",")}%
                </p>
                <p className="font-semibold text-emerald-400">
                  ⇒ {formatarMoeda(d.comissao + d.oportunidade.ganho)} (+ {formatarMoeda(d.oportunidade.ganho)})
                </p>
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Projeção em tempo real — o valor oficial sai na etapa 3 do fechamento, após as comissões individuais.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* risco de zerar + composição da meta */}
      <div
        className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          d.riscoZerar.length > 0 ? "border-rose-300 bg-rose-50 text-rose-900" : "border bg-muted/40 text-muted-foreground"
        }`}
      >
        {d.riscoZerar.length > 0 ? (
          <>
            ⚠ <strong>Risco de zerar:</strong> {d.riscoZerar.map((p) => p.rotulo).join(" e ")} abaixo da faixa de
            entrada — se fechar assim, o override do mês inteiro é <strong>R$ 0,00</strong>, independentemente dos demais pilares.
          </>
        ) : (
          <>
            <strong>Risco de zerar:</strong> qualquer pilar abaixo da entrada (Vendas &lt; 60% · Refidelização &lt; 60% ·
            Retenção &lt; 16) zera o override integral do mês. Nenhum pilar em risco hoje. ✓
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Composição da meta de vendas ({d.pilares[0].meta})</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          <p>
            {d.metaVendasComposicao.map((m) => `${m.nome} (${m.meta})`).join(" · ")}
          </p>
          {d.foraDaMeta.length > 0 && (
            <p className="mt-1">
              Fora da meta gerencial (resultado conta em volume e valor): {d.foraDaMeta.join(", ")}.
              A meta recalcula sozinha quando o quadro muda (rampa concluída, admissão, loja).
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
