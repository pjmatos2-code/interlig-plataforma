import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/format";
import { META_REFIDELIZACAO, type ResultadoAgente } from "@/lib/refidelizacao/dados";

/**
 * Visão da própria agente do Setor de Atendimento: quanto já rendeu e,
 * principalmente, quais aditivos ainda não contam — para ela correr atrás da
 * assinatura antes do fechamento.
 */
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

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle>Minha refidelização — mês corrente</CardTitle>
        <p className="text-sm text-muted-foreground">
          Conta o aditivo aprovado e assinado pelo cliente e pelo provedor. A base da comissão é
          o valor mensal do plano — o desconto concedido não entra.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Planos válidos</p>
            <p className="text-2xl font-semibold tabular-nums">{dados.validos}</p>
            <p className="text-xs text-muted-foreground">meta {META_REFIDELIZACAO}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Atingimento</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatarPercentual(dados.atingimentoPct / 100, 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {dados.faixa} · {dados.percentual}%
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">VTV refidelizado</p>
            <p className="text-xl font-semibold tabular-nums">{formatarMoeda(dados.vtv)}</p>
          </div>
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Comissão</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(dados.comissao)}</p>
          </div>
        </div>

        {proxima ? (
          <div className="rounded-md border border-farol-amarelo/50 bg-farol-amarelo/10 px-3 py-2 text-sm">
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
          <div className="rounded-md border border-farol-verde/50 bg-farol-verde/10 px-3 py-2 text-sm">
            🏆 Você está na faixa máxima — <strong>{dados.faixa}</strong>, {dados.percentual}% sobre
            o VTV refidelizado.
          </div>
        )}

        <div className="rounded-lg border">
          <div className="border-b bg-amber-50/60 px-4 py-2.5">
            <p className="text-sm font-semibold text-amber-900">
              ⚠ Aguardando assinatura ({pendentes.length}) — resolva antes do fechamento
            </p>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Aditivo</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 text-right font-medium">Mensal</th>
                  <th className="px-3 py-2 font-medium">O que falta</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">
                      {formatarData(l.data)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      #{l.sgpAditivoId}
                      {l.sgpContratoId && (
                        <span className="text-muted-foreground"> · ct {l.sgpContratoId}</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2">{l.cliente}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatarMoeda(l.valorMensal)}
                    </td>
                    <td className="px-3 py-2 text-xs text-amber-800">{l.pendencia}</td>
                  </tr>
                ))}
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
        </div>
        <div className="rounded-lg border">
          <div className="border-b bg-emerald-50/60 px-4 py-2.5">
            <p className="text-sm font-semibold text-emerald-900">
              ✓ Fidelizações aprovadas ({aprovadas.length}) — já contam na sua comissão
            </p>
          </div>
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
        </div>
      </CardContent>
    </Card>
  );
}
