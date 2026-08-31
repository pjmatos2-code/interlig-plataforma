import { BadgeCheck, Clock3, CircleDollarSign, Wallet, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/format";
import type { ResultadoAgente } from "@/lib/refidelizacao/dados";
import { META_REFIDELIZACAO } from "@/lib/refidelizacao/regras";

/**
 * Visão da própria agente do Setor de Atendimento: quanto já rendeu e,
 * principalmente, quais aditivos ainda não contam — para ela correr atrás da
 * assinatura antes do fechamento.
 */

function Kpi({
  icone,
  cor,
  rotulo,
  valor,
  sub,
}: {
  icone: React.ReactNode;
  cor: string;
  rotulo: string;
  valor: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${cor}18`, color: cor }}
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{rotulo}</p>
        <p className="text-xl font-semibold tabular-nums leading-tight">{valor}</p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function MinhaRefidelizacao({
  dados,
  baseSgp,
}: {
  dados: ResultadoAgente;
  /** raiz do painel do SGP, para abrir os aditivos do cliente */
  baseSgp?: string | null;
}) {
  const pendentes = dados.linhas.filter((l) => !l.conta && l.decisao !== "reprovado");
  const aprovadas = dados.linhas.filter((l) => l.conta);
  // a aba de aditivos do cliente é a tela mais útil: mostra o histórico dele
  const linkDe = (clienteId: string | null) =>
    baseSgp && clienteId ? `${baseSgp}/cliente/${clienteId}/aditivos/` : null;
  // quanto falta para a próxima faixa, e quanto ela passaria a receber. A
  // projeção usa o ticket médio dela — é estimativa, e o texto diz isso.
  const ticketMedio = dados.validos > 0 ? dados.vtv / dados.validos : 0;
  const proxima = [
    { nome: "MÍNIMA", planos: Math.ceil(0.8 * META_REFIDELIZACAO), pct: 3.5 },
    { nome: "SUPERAÇÃO", planos: Math.ceil(1.01 * META_REFIDELIZACAO), pct: 4 },
    { nome: "ALTA", planos: Math.ceil(1.21 * META_REFIDELIZACAO), pct: 5 },
    { nome: "DESAFIO", planos: 250, pct: 7 },
  ].find((f) => dados.validos < f.planos);
  const comissaoNaProxima = proxima ? (ticketMedio * proxima.planos * proxima.pct) / 100 : 0;
  const pendentesAjudam = proxima ? Math.min(pendentes.length, proxima.planos - dados.validos) : 0;
  const pctMeta = dados.atingimentoPct;

  return (
    <div className="mt-6 space-y-4">
      {/* KPIs no padrão do painel do setor */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          icone={<BadgeCheck className="h-5 w-5" />}
          cor="#059669"
          rotulo="Aprovados"
          valor={String(dados.validos)}
          sub="assinados — já contam"
        />
        <Kpi
          icone={<Clock3 className="h-5 w-5" />}
          cor="#d97706"
          rotulo="Pendentes"
          valor={String(pendentes.length)}
          sub={pendentes.length > 0 ? "corra atrás da assinatura" : "nada pendente"}
        />
        <Kpi
          icone={<CircleDollarSign className="h-5 w-5" />}
          cor="#0284c7"
          rotulo="VTV refidelizado"
          valor={formatarMoeda(dados.vtv)}
          sub="base: valor mensal"
        />
        <Kpi
          icone={<Wallet className="h-5 w-5" />}
          cor="#7c3aed"
          rotulo="Minha comissão"
          valor={formatarMoeda(dados.comissao)}
          sub={`faixa ${dados.faixa} · ${dados.percentual}%`}
        />
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: "#05966918", color: "#059669" }}
            >
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Meta ({META_REFIDELIZACAO} planos)</p>
              <p className="text-xl font-semibold tabular-nums leading-tight">
                {formatarPercentual(pctMeta / 100, 0)}
              </p>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, pctMeta)}%`,
                backgroundColor: pctMeta >= 100 ? "#059669" : pctMeta >= 80 ? "#2563eb" : "#d97706",
              }}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
            {dados.validos} / {META_REFIDELIZACAO} planos
          </p>
        </div>
      </div>

      {proxima ? (
        <div className="rounded-xl border border-farol-amarelo/50 bg-farol-amarelo/10 px-4 py-3 text-sm">
          🎯 Faltam <strong>{proxima.planos - dados.validos} plano(s)</strong> para a faixa{" "}
          <strong>{proxima.nome}</strong> ({proxima.pct}%) — sua comissão passaria a cerca de{" "}
          <strong>{formatarMoeda(comissaoNaProxima)}</strong>
          {pendentesAjudam > 0 && (
            <>
              .{" "}
              <span className="text-amber-900">
                Você tem {pendentes.length} aguardando assinatura: {pendentesAjudam} deles já
                {pendentesAjudam === proxima.planos - dados.validos
                  ? " fecham a faixa"
                  : " contam para isso"}
                .
              </span>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-farol-verde/50 bg-farol-verde/10 px-4 py-3 text-sm">
          🏆 Você está na faixa máxima — <strong>{dados.faixa}</strong>, {dados.percentual}% sobre o
          VTV refidelizado.
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ⚠ Aguardando assinatura ({pendentes.length})
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              resolva antes do fechamento
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Aditivo</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Mensal</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((l) => {
                  const link = linkDe(l.sgpClienteId);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatarData(l.data)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-interlig-ceu hover:underline"
                            title="Abrir os aditivos deste cliente no SGP"
                          >
                            #{l.sgpAditivoId} ↗
                          </a>
                        ) : (
                          <>#{l.sgpAditivoId}</>
                        )}
                        {l.sgpContratoId && (
                          <span className="text-muted-foreground"> · ct {l.sgpContratoId}</span>
                        )}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2">{l.cliente}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarMoeda(l.valorMensal)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          {l.pendencia}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {pendentes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-farol-verde">
                      ✓ Nenhum aditivo pendente — todos assinados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            ✓ Fidelizações aprovadas ({aprovadas.length})
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              já contam na sua comissão
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pb-2">
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Contrato</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Plano</th>
                  <th className="px-3 py-2 text-right font-medium">Valor mensal</th>
                </tr>
              </thead>
              <tbody>
                {aprovadas.map((l) => {
                  const link = linkDe(l.sgpClienteId);
                  return (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {formatarData(l.data)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-interlig-ceu hover:underline"
                            title="Abrir os aditivos deste cliente no SGP"
                          >
                            {l.sgpContratoId ?? l.sgpAditivoId} ↗
                          </a>
                        ) : (
                          <span>{l.sgpContratoId ?? "—"}</span>
                        )}
                      </td>
                      <td className="max-w-[15rem] truncate px-3 py-2">{l.cliente}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.plano ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatarMoeda(l.valorMensal)}
                      </td>
                    </tr>
                  );
                })}
                {aprovadas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhuma fidelização aprovada ainda neste mês.
                    </td>
                  </tr>
                )}
              </tbody>
              {aprovadas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="px-4 py-2" colSpan={4}>
                      Total ({aprovadas.length} planos)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarMoeda(dados.vtv)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
