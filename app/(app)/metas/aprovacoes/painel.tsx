"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarMoeda } from "@/lib/format";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { Lock, Undo2, X } from "lucide-react";
import type { Desfecho, FilaAprovacao, ItemAprovacao } from "@/lib/comissao/aprovacoes";
import {
  aprovarVenda,
  revogarAprovacao,
  atribuirVendedoraContrato,
  dispensarAssinatura,
  encerrarSemComissao,
  desfazerDesfecho,
} from "./acoes";

/**
 * O template do SGP abre a FICHA DO CLIENTE (/cliente/{cliente_id}/edit/), por
 * isso o link precisa do id do cliente — o número exibido é o do contrato.
 */
function LinkSgp({
  contratoId,
  clienteId,
  template,
}: {
  contratoId: string | null;
  clienteId: string | null;
  template: string | null;
}) {
  if (!contratoId) return <span className="text-muted-foreground">—</span>;
  const url = aplicarLinkSgp(template, { clienteId, contratoId, cpf: null });
  if (!url) return <span className="tabular-nums">#{contratoId}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="tabular-nums text-primary hover:underline"
    >
      #{contratoId} ↗
    </a>
  );
}

type Modo = null | "aprovar" | "desfecho" | "dispensar";

const ROTULO_DESFECHO: Record<Desfecho["tipo"], string> = {
  desistencia: "Cliente desistiu da instalação",
  nao_comissiona: "Não comissiona",
};

/** o motivo gravado começa pelo nome da opção; na tela mostra só a observação */
function observacaoDoDesfecho(d: Desfecho): string {
  const rotulo = ROTULO_DESFECHO[d.tipo];
  return d.motivo.startsWith(rotulo) ? d.motivo.slice(rotulo.length).replace(/^:\s*/, "") : d.motivo;
}

function Linha({
  item,
  competencia,
  vendedoras,
  template,
  secao,
}: {
  item: ItemAprovacao;
  competencia: string;
  vendedoras: { id: string; nome: string }[];
  template: string | null;
  secao: "pendente" | "aprovada" | "encerrada";
}) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(fn: () => Promise<{ erro?: string }>) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    setOcupado(false);
    if (r.erro) return setErro(r.erro);
    setModo(null);
    setMotivo("");
    router.refresh();
  }
  const fechar = () => {
    setModo(null);
    setMotivo("");
    setErro(null);
  };

  const botao = "rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50";
  const primario = `${botao} bg-primary text-primary-foreground hover:bg-primary/90`;
  const contorno = `${botao} border bg-background hover:bg-muted`;

  const campoMotivo = (placeholder: string, confirmar: () => void, rotulo: string) => (
    <div className="flex items-center justify-end gap-1">
      <input
        autoFocus
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && confirmar()}
        placeholder={placeholder}
        className="h-8 w-48 rounded-md border border-input bg-background px-2 text-xs"
      />
      <button type="button" disabled={ocupado} onClick={confirmar} className={primario}>
        {rotulo}
      </button>
      <button type="button" onClick={fechar} aria-label="Cancelar" className={`${botao} border hover:bg-muted`}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  let acoes: React.ReactNode;
  if (secao === "aprovada") {
    acoes = (
      <button type="button" disabled={ocupado} onClick={() => executar(() => revogarAprovacao(item.contratoId, competencia))} className={contorno}>
        Revogar
      </button>
    );
  } else if (secao === "encerrada" && item.desfecho) {
    const t = item.desfecho.tipo;
    acoes = (
      <button type="button" disabled={ocupado} onClick={() => executar(() => desfazerDesfecho(item.contratoId, competencia, t))} className={contorno}>
        <Undo2 className="mr-1 inline h-3.5 w-3.5" />
        Desfazer
      </button>
    );
  } else if (modo === "aprovar") {
    acoes = campoMotivo("motivo da liberação", () => executar(() => aprovarVenda(item.contratoId, competencia, motivo, item.pendencias)), "Confirmar");
  } else if (modo === "dispensar") {
    acoes = campoMotivo("cortesia, licitação, evento…", () => executar(() => dispensarAssinatura(item.contratoId, motivo)), "Dispensar");
  } else if (modo === "desfecho") {
    // um clique (27/11/2026): a opção já é o motivo; o texto é só observação
    acoes = (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {(["desistencia", "nao_comissiona"] as const).map((op) => {
            const bloqueada = op === "desistencia" && item.ativado;
            return (
              <button
                key={op}
                type="button"
                disabled={ocupado || bloqueada}
                title={bloqueada ? "Este contrato já foi ativado" : "Encerra a venda sem comissão"}
                onClick={() => executar(() => encerrarSemComissao(item.contratoId, competencia, op, motivo))}
                className={`${contorno} disabled:cursor-not-allowed`}
              >
                {ROTULO_DESFECHO[op]}
              </button>
            );
          })}
          <button type="button" onClick={fechar} aria-label="Cancelar" className={`${botao} border hover:bg-muted`}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <input
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="observação (opcional), antes de clicar"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
        />
      </div>
    );
  } else {
    acoes = (
      <div className="flex items-center justify-end gap-1">
        {item.bloqueioAbsoluto ? (
          <button type="button" onClick={() => setModo("dispensar")} className={contorno} title="Só para contratos que por natureza não têm Termo/Fidelidade">
            Dispensar assinatura
          </button>
        ) : (
          <button type="button" onClick={() => setModo("aprovar")} className={primario}>
            Aprovar
          </button>
        )}
        <button type="button" onClick={() => setModo("desfecho")} className={contorno}>
          Desfecho
        </button>
      </div>
    );
  }

  return (
    <tr className="border-t align-top">
      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground tabular-nums">
        {formatarData(item.dataVenda)}
      </td>
      <td className="whitespace-nowrap px-3 py-2">
        <LinkSgp
          contratoId={item.sgpContratoId}
          clienteId={item.sgpClienteId}
          template={template}
        />
      </td>
      <td className="px-3 py-2">{item.cliente}</td>
      <td className="px-3 py-2 text-muted-foreground">{item.plano ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {formatarMoeda(item.valor)}
      </td>
      <td className="px-3 py-2">
        {secao === "pendente" ? (
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
        ) : (
          <span className="text-xs">{item.vendedora}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {item.pendencias.map((p) => (
            <Badge key={p} variant="secondary" className="font-normal">
              {p}
            </Badge>
          ))}
          {secao === "pendente" && item.bloqueioAbsoluto && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Política: venda sem Termo e Fidelidade não comissiona">
              <Lock className="h-3 w-3" />
              sem Termo/Fidelidade
            </span>
          )}
        </div>
        {secao === "aprovada" && item.aprovacao && (
          <p className="mt-1 text-xs text-farol-verde">
            liberada por {item.aprovacao.aprovadoPor ?? "gestão"}: {item.aprovacao.motivo}
          </p>
        )}
        {secao === "encerrada" && item.desfecho && (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{ROTULO_DESFECHO[item.desfecho.tipo]}</span>
            {item.desfecho.definidoPor ? ` · ${item.desfecho.definidoPor}` : ""}
            {observacaoDoDesfecho(item.desfecho) ? `: ${observacaoDoDesfecho(item.desfecho)}` : ""}
          </p>
        )}
        {erro && <p className="mt-1 text-xs text-farol-vermelho">{erro}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{acoes}</td>
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
  const tabela = (itens: ItemAprovacao[], secao: "pendente" | "aprovada" | "encerrada") => (
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
              secao={secao}
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
            do mês; Desfecho encerra sem comissão e tira da fila. O motivo fica registrado no seu nome.
          </p>
        </CardHeader>
        <CardContent className="p-0 pb-3">
          {fila.pendentes.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-farol-verde">
              ✓ Nenhuma venda pendente de decisão nesta competência.
            </p>
          ) : (
            tabela(fila.pendentes, "pendente")
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
          <CardContent className="p-0 pb-3">{tabela(fila.aprovados, "aprovada")}</CardContent>
        </Card>
      )}

      {fila.encerradas.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer list-none px-6 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-base font-semibold">Encerradas sem comissão ({fila.encerradas.length})</span>
              <span className="ml-2 text-sm text-muted-foreground">ver ▾</span>
              <p className="mt-1 text-sm text-muted-foreground">
                Saíram da fila com desfecho. Não entram na comissão; Desfazer devolve a venda para a fila.
              </p>
            </summary>
            <CardContent className="p-0 pb-3">{tabela(fila.encerradas, "encerrada")}</CardContent>
          </details>
        </Card>
      )}
    </div>
  );
}
