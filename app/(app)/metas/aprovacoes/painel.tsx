"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda } from "@/lib/format";
import type { FilaAprovacao, ItemAprovacao } from "@/lib/comissao/aprovacoes";
import { aprovarVenda, revogarAprovacao, atribuirVendedoraContrato } from "./acoes";

function LinkSgp({ id, template }: { id: string | null; template: string | null }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  if (!template) return <span className="tabular-nums">#{id}</span>;
  return (
    <a
      href={template.replace("{contrato}", id)}
      target="_blank"
      rel="noreferrer"
      className="tabular-nums text-primary hover:underline"
    >
      #{id} ↗
    </a>
  );
}

function Linha({
  item,
  competencia,
  vendedoras,
  template,
  aprovado,
}: {
  item: ItemAprovacao;
  competencia: string;
  vendedoras: { id: string; nome: string }[];
  template: string | null;
  aprovado: boolean;
}) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(fn: () => Promise<{ erro?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setAbrindo(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <tr className="border-t align-top">
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
        {formatarData(item.dataVenda)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <LinkSgp id={item.sgpContratoId} template={template} />
      </td>
      <td className="px-3 py-2">{item.cliente}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.plano ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatarMoeda(item.valor)}
      </td>
      <td className="px-3 py-2">
        <select
          defaultValue={item.vendedorId ?? ""}
          disabled={ocupado}
          onChange={(e) =>
            e.target.value && executar(() => atribuirVendedoraContrato(item.contratoId, e.target.value))
          }
          className="h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="">— não atribuída —</option>
          {vendedoras.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {item.pendencias.map((p) => (
            <Badge key={p} variant="secondary" className="font-normal">
              {p}
            </Badge>
          ))}
        </div>
        {aprovado && item.aprovacao && (
          <p className="mt-1 text-xs text-farol-verde">
            liberada por {item.aprovacao.aprovadoPor ?? "gestão"}: {item.aprovacao.motivo}
          </p>
        )}
        {erro && <p className="mt-1 text-xs text-farol-vermelho">{erro}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {aprovado ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => executar(() => revogarAprovacao(item.contratoId, competencia))}
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            Revogar
          </button>
        ) : item.bloqueioAbsoluto ? (
          <span
            className="text-xs text-muted-foreground"
            title="Política da empresa: venda sem assinatura não comissiona"
          >
            🔒 exige assinatura
          </span>
        ) : abrindo ? (
          <div className="flex items-center justify-end gap-1">
            <input
              autoFocus
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="motivo da liberação"
              className="h-8 w-52 rounded-md border border-input bg-background px-2 text-xs"
            />
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                executar(() =>
                  aprovarVenda(item.contratoId, competencia, motivo, item.pendencias)
                )
              }
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setAbrindo(false)}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
          >
            Aprovar
          </button>
        )}
      </td>
    </tr>
  );
}

const CABECALHO = ["Data", "Contrato", "Cliente", "Plano", "Valor", "Vendedora", "O que falta", ""];

export function PainelAprovacoes({
  fila,
  template,
}: {
  fila: FilaAprovacao;
  template: string | null;
}) {
  const tabela = (itens: ItemAprovacao[], aprovado: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[54rem] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            {CABECALHO.map((c, i) => (
              <th key={c || i} className={`px-3 py-2 ${c === "Valor" ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <Linha
              key={i.contratoId}
              item={i}
              competencia={fila.competencia}
              vendedoras={fila.vendedoras}
              template={template}
              aprovado={aprovado}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            Aguardando decisão ({fila.pendentes.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Vendas que a regra automática não liberou. Aprovar faz a venda contar na comissão
            do mês — o motivo fica registrado no seu nome.
          </p>
        </CardHeader>
        <CardContent className="p-0 pb-3">
          {fila.pendentes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-farol-verde">
              ✓ Nenhuma venda pendente de decisão nesta competência.
            </p>
          ) : (
            tabela(fila.pendentes, false)
          )}
        </CardContent>
      </Card>

      {fila.aprovados.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Liberadas manualmente ({fila.aprovados.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Já entram na comissão. Revogar devolve a venda para a fila acima.
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-3">{tabela(fila.aprovados, true)}</CardContent>
        </Card>
      )}
    </div>
  );
}
