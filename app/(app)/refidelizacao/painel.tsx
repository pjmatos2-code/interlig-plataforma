"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda, formatarPercentual } from "@/lib/format";
import type { AditivoLinha, ResultadoAgente, RefidelizacaoMes } from "@/lib/refidelizacao/dados";
import { decidirAditivo, limparDecisao, ajustarValor, sincronizar } from "./acoes";

function Linha({ l }: { l: AditivoLinha }) {
  const router = useRouter();
  const [modo, setModo] = useState<null | "aprovar" | "reprovar" | "valor">(null);
  const [texto, setTexto] = useState("");
  const [valor, setValor] = useState(String(l.valorMensal));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(fn: () => Promise<{ erro?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setModo(null);
    setTexto("");
    router.refresh();
  }

  return (
    <tr className={`border-t align-top ${l.conta ? "" : "bg-amber-50/40"}`}>
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
        {formatarData(l.data)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        #{l.sgpAditivoId}
        {l.sgpContratoId && <span className="text-muted-foreground"> · ct {l.sgpContratoId}</span>}
      </td>
      <td className="max-w-[13rem] truncate px-3 py-2">{l.cliente}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{l.plano ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatarMoeda(l.valorMensal)}
        {l.valorAjustado !== null && (
          <span className="ml-1 text-[11px] text-primary" title={l.ajusteMotivo ?? ""}>
            ajustado
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {l.conta ? (
          <Badge variant="secondary" className="font-normal text-farol-verde">
            {l.decisao === "aprovado" ? "liberado pela gestão" : "assinado"}
          </Badge>
        ) : (
          <span className="text-xs text-amber-800">{l.pendencia}</span>
        )}
        {l.decisaoMotivo && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{l.decisaoMotivo}</p>
        )}
        {erro && <p className="mt-1 text-xs text-farol-vermelho">{erro}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {modo ? (
          <div className="flex items-center justify-end gap-1">
            {modo === "valor" && (
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-8 w-20 rounded-md border border-input bg-background px-2 text-xs"
                placeholder="mensal"
              />
            )}
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="motivo"
              className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                executar(() =>
                  modo === "valor"
                    ? ajustarValor(l.id, Number(valor.replace(",", ".")), texto)
                    : decidirAditivo(l.id, modo === "aprovar" ? "aprovado" : "reprovado", texto)
                )
              }
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setModo(null)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-1">
            {!l.conta && (
              <button
                type="button"
                onClick={() => setModo("aprovar")}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
              >
                Aprovar
              </button>
            )}
            {l.conta && l.decisao !== "reprovado" && (
              <button
                type="button"
                onClick={() => setModo("reprovar")}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                Reprovar
              </button>
            )}
            {l.decisao && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => executar(() => limparDecisao(l.id))}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                title="Volta a valer a assinatura do SGPsign"
              >
                Desfazer
              </button>
            )}
            <button
              type="button"
              onClick={() => setModo("valor")}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              title="Corrigir o valor mensal (cobrança anual no SGP)"
            >
              R$
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function Agente({ a, soPendentes }: { a: ResultadoAgente; soPendentes: boolean }) {
  const linhas = soPendentes ? a.linhas.filter((l) => !l.conta) : a.linhas;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle>{a.nome ?? a.agente}</CardTitle>
          <p className="text-sm">
            <strong className="tabular-nums">{a.validos}</strong> planos ·{" "}
            {formatarPercentual(a.atingimentoPct / 100, 0)} ·{" "}
            <span className="font-medium">{a.faixa}</span> {a.percentual}% ·{" "}
            <strong>{formatarMoeda(a.comissao)}</strong>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          VTV {formatarMoeda(a.vtv)} · {a.pendentes} pendente(s)
          {a.reprovados > 0 && ` · ${a.reprovados} reprovado(s)`}
        </p>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        {linhas.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-farol-verde">
            ✓ Nenhum aditivo pendente.
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[54rem] text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Aditivo</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Plano</th>
                  <th className="px-3 py-2 text-right">Mensal</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <Linha key={l.id} l={l} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PainelRefidelizacao({ dados }: { dados: RefidelizacaoMes }) {
  const router = useRouter();
  const [soPendentes, setSoPendentes] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={soPendentes}
            onChange={(e) => setSoPendentes(e.target.checked)}
          />
          Mostrar só os pendentes
        </label>
        <div className="flex items-center gap-2">
          {aviso && <span className="text-xs text-muted-foreground">{aviso}</span>}
          <button
            type="button"
            disabled={sincronizando}
            onClick={async () => {
              setSincronizando(true);
              const r = await sincronizar(dados.competencia);
              setSincronizando(false);
              setAviso(r.erro ?? r.ok ?? null);
              router.refresh();
            }}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {sincronizando ? "Buscando no SGP…" : "🔄 Sincronizar com o SGP"}
          </button>
        </div>
      </div>

      {dados.agentes.map((a) => (
        <Agente key={a.agente} a={a} soPendentes={soPendentes} />
      ))}
    </div>
  );
}
