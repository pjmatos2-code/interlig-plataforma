import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { filaAprovacao } from "@/lib/comissao/aprovacoes";
import { comissoesDoMes } from "@/lib/comissao/dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { formatarNumero } from "@/lib/format";
import { PainelAprovacoes } from "./painel";
import { RelatorioFechamento } from "@/components/comissao/relatorio-fechamento";
import { ChaveDebito } from "@/components/comissao/chave-debito";
import { debitoPorCoorte } from "@/lib/comissao/debito";

export const dynamic = "force-dynamic";

export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: { mes?: string; agente?: string };
}) {
  // Fechamento é decisão do Administrador (mesma régua do módulo Metas)
  await exigirPerfil(["gestor"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());

  const [fila, comissoes, template, debito] = await Promise.all([
    filaAprovacao(mes),
    comissoesDoMes(mes),
    templateLinkSgp(),
    debitoPorCoorte(mes),
  ]);

  // filtro por agente (atalho da faixa de pendentes em Comissões): "sem" = sem vendedora
  const agente = searchParams.agente ?? null;
  const daAgente = (i: { vendedorId: string | null }) =>
    !agente || (agente === "sem" ? !i.vendedorId : i.vendedorId === agente);
  const filaFiltrada = {
    ...fila,
    pendentes: fila.pendentes.filter(daAgente),
    aprovados: fila.aprovados.filter(daAgente),
  };
  const porAgente = new Map<string, { nome: string; n: number }>();
  for (const i of fila.pendentes) {
    const k = i.vendedorId ?? "sem";
    const atual = porAgente.get(k) ?? { nome: i.vendedorId ? i.vendedora : "Sem vendedora", n: 0 };
    atual.n += 1;
    porAgente.set(k, atual);
  }
  const chips = [...porAgente.entries()].sort((a, b) => b[1].n - a[1].n);
  const mesParam = mes.slice(0, 7);

  return (
    <>
      <div className="mb-1 flex gap-4 text-sm">
        <Link href="/metas" className="text-muted-foreground hover:text-foreground">
          ← Metas e comissão
        </Link>
        <Link href={`/comissoes?mes=${mesParam}`} className="text-muted-foreground hover:text-foreground">
          ← Comissões
        </Link>
      </div>
      <CabecalhoPagina
        titulo="Aprovação de vendas"
        descricao="A vendedora da venda é a do campo vendedor do SGP. Instalação pendente você libera; sem Termo de Adesão e Fidelidade assinados, ninguém libera."
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Competência</span>
            <input
              type="month"
              name="mes"
              defaultValue={mes.slice(0, 7)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Aplicar
          </button>
        </form>
        <RelatorioFechamento
          comissoes={comissoes}
          competencia={mes}
          debitoAplicado={debito.aplicado}
        />
      </div>

      <div className="mb-4">
        <ChaveDebito
          competencia={mes}
          aplicado={debito.aplicado}
          observacao={debito.observacao}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoKpi rotulo="Vendas na competência" valor={formatarNumero(fila.totais.vendas)} />
        <CartaoKpi
          rotulo="Liberadas pela regra"
          valor={formatarNumero(fila.totais.liberadasAuto)}
          contexto="contrato ativo e assinaturas em dia"
        />
        <CartaoKpi
          rotulo="Liberadas pela gestão"
          valor={formatarNumero(fila.totais.aprovadasMao)}
          contexto="aprovação manual registrada"
        />
        <CartaoKpi
          rotulo="Aguardando decisão"
          valor={formatarNumero(fila.totais.pendentes)}
          contexto={fila.totais.pendentes > 0 ? "resolva antes do fechamento" : "nada pendente"}
          tom={fila.totais.pendentes > 0 ? "amarelo" : "verde"}
        />
      </div>

      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pendentes por agente:</span>
          <Link
            href={`/metas/aprovacoes?mes=${mesParam}`}
            className={`rounded-full border px-3 py-1 text-sm ${!agente ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            Todas ({fila.pendentes.length})
          </Link>
          {chips.map(([id, c]) => (
            <Link
              key={id}
              href={`/metas/aprovacoes?mes=${mesParam}&agente=${id}`}
              className={`rounded-full border px-3 py-1 text-sm ${agente === id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {c.nome} ({c.n})
            </Link>
          ))}
        </div>
      )}

      <PainelAprovacoes fila={filaFiltrada} template={template} />
    </>
  );
}
