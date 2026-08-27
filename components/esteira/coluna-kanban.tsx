import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatarMoeda } from "@/lib/format";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import type { ItemEsteira } from "@/lib/esteira/dados";
import { BotaoAtualizarContrato } from "@/components/esteira/botao-atualizar";

const LIMITE_VISIVEL = 25;

/** Card com nome do cliente e ID do contrato clicáveis, abrindo no SGP. */
function LinhaCliente({ item, linkTemplate, mostrarPop }: { item: ItemEsteira; linkTemplate: string; mostrarPop: boolean }) {
  const link = aplicarLinkSgp(linkTemplate, {
    clienteId: item.sgpClienteId,
    contratoId: item.sgpContratoId,
    cpf: item.cpf,
  });
  const nome = link ? (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="min-w-0 truncate font-medium text-primary hover:underline"
      title="Abrir cliente no SGP"
    >
      {item.cliente}
    </a>
  ) : (
    <span className="min-w-0 truncate font-medium">{item.cliente}</span>
  );
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {nome}
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
            item.alerta ? "bg-farol-vermelho/15 text-farol-vermelho" : "bg-muted text-muted-foreground"
          )}
        >
          {item.idadeDias === 0 ? "hoje" : `${item.idadeDias} d`}
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {item.vendedora}
        {mostrarPop && ` · ${item.pop}`}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {item.plano} · {formatarMoeda(item.valor)}
        <span className="ml-auto inline-flex items-center gap-1">
          {item.sgpContratoId && link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded bg-interlig-ceu/10 px-1.5 py-0.5 font-mono text-[11px] text-interlig-ceu hover:underline"
              title="Contrato no SGP"
            >
              #{item.sgpContratoId}
            </a>
          )}
          <BotaoAtualizarContrato contratoId={item.id} />
        </span>
      </p>
      {item.temOs && <LinhaOs item={item} linkTemplate={linkTemplate} />}
    </>
  );
}

/** OS de instalação (D9): agendamento + responsável, linkando nas ocorrências do painel. */
function LinhaOs({ item, linkTemplate }: { item: ItemEsteira; linkTemplate: string }) {
  const linkOcorrencias = item.sgpClienteId
    ? aplicarLinkSgp(
        linkTemplate.replace(/\/cliente\/\{cliente_id\}\/edit\/?$/, "/atendimento/cliente/{cliente_id}/ocorrencias/"),
        { clienteId: item.sgpClienteId, contratoId: item.sgpContratoId, cpf: item.cpf }
      )
    : null;
  const dataAgenda = item.agendamento
    ? new Date(item.agendamento).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Belem",
      })
    : null;
  const conteudo = (
    <span className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "rounded px-1.5 py-0.5 text-[11px] font-medium",
          dataAgenda ? "bg-farol-verde/15 text-farol-verde" : "bg-muted text-muted-foreground"
        )}
      >
        {dataAgenda ? `Instalação: ${dataAgenda}` : "Sem agendamento"}
      </span>
      {item.prontaOperacional && (
        <span className="rounded bg-interlig-ceu/10 px-1.5 py-0.5 text-[11px] font-medium text-interlig-ceu">
          pronta p/ operacional
        </span>
      )}
      {item.responsavel && (
        <span className="truncate text-[11px] text-muted-foreground">resp. {item.responsavel}</span>
      )}
    </span>
  );
  return (
    <p className="mt-1.5 border-t pt-1.5 text-xs">
      {linkOcorrencias ? (
        <a
          href={linkOcorrencias}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir ocorrências no SGP"
          className="block hover:opacity-80"
        >
          {conteudo}
        </a>
      ) : (
        conteudo
      )}
    </p>
  );
}

/** Coluna do kanban da esteira (PRD 3.5): mais antigos primeiro, alerta em vermelho. */
export function ColunaKanban({
  titulo,
  descricaoIdade,
  itens,
  tom,
  mostrarPop,
  linkTemplate,
}: {
  titulo: string;
  descricaoIdade: string;
  itens: ItemEsteira[];
  tom: "amarelo" | "azul" | "verde";
  mostrarPop: boolean;
  linkTemplate: string;
}) {
  const visiveis = itens.slice(0, LIMITE_VISIVEL);
  const ocultos = itens.length - visiveis.length;
  const emAlerta = itens.filter((i) => i.alerta).length;

  return (
    <div className="flex min-w-0 flex-col rounded-lg border bg-muted/30">
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2.5",
          tom === "amarelo" && "bg-farol-amarelo/10",
          tom === "azul" && "bg-interlig-ceu/10",
          tom === "verde" && "bg-farol-verde/10"
        )}
      >
        <div>
          <p className="text-sm font-semibold">{titulo}</p>
          <p className="text-xs text-muted-foreground">{descricaoIdade}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {emAlerta > 0 && <Badge variant="vermelho">{emAlerta} em alerta</Badge>}
          <Badge variant="secondary">{itens.length}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto p-2" style={{ maxHeight: "34rem" }}>
        {visiveis.map((item) => (
          <Card
            key={item.id}
            className={cn(
              "p-2.5 text-sm shadow-none",
              item.alerta && "border-farol-vermelho/60 bg-farol-vermelho/5"
            )}
          >
            <LinhaCliente item={item} linkTemplate={linkTemplate} mostrarPop={mostrarPop} />
          </Card>
        ))}
        {itens.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nada por aqui 🎉</p>
        )}
        {ocultos > 0 && (
          <p className="px-2 py-1.5 text-center text-xs text-muted-foreground">
            … e mais {ocultos} (os mais antigos aparecem primeiro)
          </p>
        )}
      </div>
    </div>
  );
}
