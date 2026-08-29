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

export const dynamic = "force-dynamic";

export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  // Fechamento é decisão do Administrador (mesma régua do módulo Metas)
  await exigirPerfil(["gestor"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());

  const [fila, comissoes, template] = await Promise.all([
    filaAprovacao(mes),
    comissoesDoMes(mes),
    templateLinkSgp(),
  ]);

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/metas" className="text-muted-foreground hover:text-foreground">
          ← Metas e comissão
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
        <RelatorioFechamento comissoes={comissoes} competencia={mes} />
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

      <PainelAprovacoes fila={fila} template={template} />
    </>
  );
}
