"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import {
  salvarRegraComissao,
  encerrarRegra,
  excluirRegra,
  type EstadoRegra,
} from "@/app/(app)/metas/acoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatarMoeda } from "@/lib/format";
import type { DegrauComissao, GatilhoComissao } from "@/lib/indicadores/comissao";

const inicial: EstadoRegra = {};
const selectCls = "flex h-10 rounded-md border border-input bg-background px-3 text-sm";

type LinhaDegrau = { min: string; max: string; tipo: "valor_por_venda" | "percentual_receita"; valor: string; bonus: string };
type LinhaGatilho =
  | { condicao: "ticket_medio_min"; valor: string; adicional: string }
  | { condicao: "plano_premium"; plano: string; adicional: string };

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Criar regra"}
    </Button>
  );
}

export type RegraListada = {
  id: string;
  escopo: "global" | "pop" | "vendedora";
  referencia: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  degraus: DegrauComissao[];
  gatilhos: GatilhoComissao[];
  estorno_dias: number;
};

export function GestaoRegrasComissao({
  regras,
  pops,
  vendedoras,
  mesAtual,
}: {
  regras: RegraListada[];
  pops: { id: string; nome: string }[];
  vendedoras: { id: string; nome: string }[];
  mesAtual: string; // aaaa-mm
}) {
  const router = useRouter();
  const [estado, acao] = useFormState(salvarRegraComissao, inicial);
  const [escopo, setEscopo] = useState<"global" | "pop" | "vendedora">("global");
  const [degraus, setDegraus] = useState<LinhaDegrau[]>([
    { min: "0", max: "100", tipo: "percentual_receita", valor: "7", bonus: "" },
    { min: "101", max: "120", tipo: "percentual_receita", valor: "8", bonus: "" },
    { min: "121", max: "", tipo: "percentual_receita", valor: "10", bonus: "" },
  ]);
  const [gatilhos, setGatilhos] = useState<LinhaGatilho[]>([]);
  const [aguardando, setAguardando] = useState<string | null>(null);

  const degrausJson = JSON.stringify(
    degraus
      .filter((d) => d.min !== "" && d.valor !== "")
      .map((d) => ({
        atingimento_min: Number(d.min),
        atingimento_max: d.max === "" ? null : Number(d.max),
        tipo: d.tipo,
        valor: Number(d.valor),
        ...(d.bonus !== "" ? { bonus_fixo: Number(d.bonus) } : {}),
      }))
  );
  const gatilhosJson = JSON.stringify(
    gatilhos
      .filter((g) => g.adicional !== "")
      .map((g) =>
        g.condicao === "ticket_medio_min"
          ? { condicao: g.condicao, valor: Number(g.valor || 0), adicional: Number(g.adicional) }
          : { condicao: g.condicao, plano: g.plano, adicional: Number(g.adicional) }
      )
  );

  const opcoes = escopo === "pop" ? pops : vendedoras;

  return (
    <div className="space-y-6">
      {/* ---------------- nova regra ---------------- */}
      <form action={acao} className="space-y-4">
        <input type="hidden" name="degraus" value={degrausJson} />
        <input type="hidden" name="gatilhos" value={gatilhosJson} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label>Escopo</Label>
            <select
              name="escopo"
              value={escopo}
              onChange={(e) => setEscopo(e.target.value as typeof escopo)}
              className={selectCls}
            >
              <option value="global">Global (toda a operação)</option>
              <option value="pop">Equipe (POP)</option>
              <option value="vendedora">Vendedora</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{escopo === "pop" ? "Equipe" : "Vendedora"}</Label>
            <select name="referencia_id" disabled={escopo === "global"} className={selectCls}>
              {escopo === "global" ? (
                <option value="">— não se aplica —</option>
              ) : opcoes.length === 0 ? (
                <option value="">nenhuma cadastrada</option>
              ) : (
                opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Vigência: início</Label>
            <Input type="month" name="vigencia_inicio" defaultValue={mesAtual} required />
          </div>
          <div className="space-y-1.5">
            <Label>Fim (opcional)</Label>
            <Input type="month" name="vigencia_fim" />
          </div>
          <div className="space-y-1.5">
            <Label>Estorno (dias)</Label>
            <Input type="number" name="estorno_dias" defaultValue={90} min={0} max={365} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Degraus por % de atingimento da meta (vale o piso alcançado)
          </p>
          <div className="space-y-2">
            {degraus.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">de</span>
                <Input
                  className="w-20"
                  type="number"
                  value={d.min}
                  onChange={(e) => setDegraus(degraus.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))}
                  aria-label="atingimento mínimo %"
                />
                <span className="text-muted-foreground">% até</span>
                <Input
                  className="w-20"
                  type="number"
                  placeholder="∞"
                  value={d.max}
                  onChange={(e) => setDegraus(degraus.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))}
                  aria-label="atingimento máximo %"
                />
                <span className="text-muted-foreground">% →</span>
                <select
                  className={selectCls}
                  value={d.tipo}
                  onChange={(e) =>
                    setDegraus(degraus.map((x, j) => (j === i ? { ...x, tipo: e.target.value as LinhaDegrau["tipo"] } : x)))
                  }
                >
                  <option value="percentual_receita">% da receita</option>
                  <option value="valor_por_venda">R$ por venda</option>
                </select>
                <Input
                  className="w-24"
                  type="number"
                  step="0.01"
                  value={d.valor}
                  onChange={(e) => setDegraus(degraus.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))}
                  aria-label="valor do degrau"
                />
                <span className="text-muted-foreground">+ bônus R$</span>
                <Input
                  className="w-24"
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={d.bonus}
                  onChange={(e) => setDegraus(degraus.map((x, j) => (j === i ? { ...x, bonus: e.target.value } : x)))}
                  aria-label="bônus fixo"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDegraus(degraus.filter((_, j) => j !== i))}
                  disabled={degraus.length === 1}
                >
                  remover
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              setDegraus([...degraus, { min: "", max: "", tipo: "percentual_receita", valor: "", bonus: "" }])
            }
          >
            + degrau
          </Button>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Gatilhos extras (opcional)</p>
          <div className="space-y-2">
            {gatilhos.map((g, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  className={selectCls}
                  value={g.condicao}
                  onChange={(e) => {
                    const condicao = e.target.value as LinhaGatilho["condicao"];
                    setGatilhos(
                      gatilhos.map((x, j) =>
                        j === i
                          ? condicao === "ticket_medio_min"
                            ? { condicao, valor: "", adicional: x.adicional }
                            : { condicao, plano: "", adicional: x.adicional }
                          : x
                      )
                    );
                  }}
                >
                  <option value="ticket_medio_min">Ticket médio ≥ R$</option>
                  <option value="plano_premium">Plano premium (por venda)</option>
                </select>
                {g.condicao === "ticket_medio_min" ? (
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    placeholder="ex.: 120"
                    value={g.valor}
                    onChange={(e) =>
                      setGatilhos(gatilhos.map((x, j) => (j === i ? { ...x, valor: e.target.value } as LinhaGatilho : x)))
                    }
                  />
                ) : (
                  <Input
                    className="w-56"
                    placeholder="nome exato do plano"
                    value={g.plano}
                    onChange={(e) =>
                      setGatilhos(gatilhos.map((x, j) => (j === i ? { ...x, plano: e.target.value } as LinhaGatilho : x)))
                    }
                  />
                )}
                <span className="text-muted-foreground">→ adicional R$</span>
                <Input
                  className="w-24"
                  type="number"
                  step="0.01"
                  value={g.adicional}
                  onChange={(e) =>
                    setGatilhos(gatilhos.map((x, j) => (j === i ? { ...x, adicional: e.target.value } as LinhaGatilho : x)))
                  }
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setGatilhos(gatilhos.filter((_, j) => j !== i))}>
                  remover
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setGatilhos([...gatilhos, { condicao: "ticket_medio_min", valor: "", adicional: "" }])}
          >
            + gatilho
          </Button>
        </div>

        {estado.erro && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{estado.erro}</p>
        )}
        {estado.ok && (
          <p className="rounded-md bg-farol-verde/10 px-3 py-2 text-sm text-farol-verde">
            Regra criada. A precedência é: vendedora → equipe → global.
          </p>
        )}
        <BotaoSalvar />
      </form>

      {/* ---------------- regras existentes ---------------- */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 font-medium">Escopo</th>
              <th className="px-3 py-2 font-medium">Vigência</th>
              <th className="px-3 py-2 font-medium">Degraus</th>
              <th className="px-3 py-2 font-medium">Gatilhos</th>
              <th className="px-3 py-2 text-right font-medium">Estorno</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {regras.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                <td className="px-3 py-2">
                  <Badge variant={r.escopo === "global" ? "secondary" : "outline"}>
                    {r.escopo === "global" ? "Global" : r.escopo === "pop" ? "Equipe" : "Vendedora"}
                  </Badge>
                  {r.escopo !== "global" && <p className="mt-1 text-xs">{r.referencia}</p>}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {r.vigencia_inicio.slice(0, 7).split("-").reverse().join("/")}
                  {" → "}
                  {r.vigencia_fim ? r.vigencia_fim.slice(0, 7).split("-").reverse().join("/") : "aberta"}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.degraus.map((d, i) => (
                    <p key={i}>
                      {d.atingimento_min}%{d.atingimento_max !== null ? `–${d.atingimento_max}%` : "+"} →{" "}
                      {d.tipo === "percentual_receita" ? `${d.valor}% da receita` : `${formatarMoeda(d.valor)}/venda`}
                      {d.bonus_fixo ? ` + ${formatarMoeda(d.bonus_fixo)}` : ""}
                    </p>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.gatilhos.length === 0
                    ? "—"
                    : r.gatilhos
                        .map((g) =>
                          g.condicao === "ticket_medio_min"
                            ? `TM ≥ ${formatarMoeda(g.valor)} (+${formatarMoeda(g.adicional)})`
                            : `${g.plano} (+${formatarMoeda(g.adicional)}/venda)`
                        )
                        .join(" · ")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.estorno_dias} d</td>
                <td className="px-3 py-2 text-right">
                  {!r.vigencia_fim && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={aguardando === r.id}
                      onClick={async () => {
                        const fim = prompt("Encerrar a vigência em qual mês? (aaaa-mm)", mesAtual);
                        if (!fim) return;
                        setAguardando(r.id);
                        await encerrarRegra(r.id, fim);
                        setAguardando(null);
                        router.refresh();
                      }}
                    >
                      Encerrar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={aguardando === r.id}
                    onClick={async () => {
                      if (!confirm("Excluir a regra? Para trocar de regra preservando histórico, prefira Encerrar e criar uma nova.")) return;
                      setAguardando(r.id);
                      await excluirRegra(r.id);
                      setAguardando(null);
                      router.refresh();
                    }}
                  >
                    Excluir
                  </Button>
                </td>
              </tr>
            ))}
            {regras.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Nenhuma regra cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Precedência no cálculo: regra da <strong>vendedora</strong> → da <strong>equipe (POP)</strong> →{" "}
        <strong>global</strong>. Mudança no meio do mês: encerre a vigente e crie a nova com a
        vigência certa — o fechamento usa a regra do mês e o histórico fica preservado.
      </p>
    </div>
  );
}
