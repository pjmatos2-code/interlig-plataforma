import { exigirPerfil } from "@/lib/auth";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { refidelizacaoDoMes, META_REFIDELIZACAO } from "@/lib/refidelizacao/dados";
import { PainelRefidelizacao } from "./painel";

export const dynamic = "force-dynamic";

export default async function RefidelizacaoPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  await exigirPerfil(["gestor"]);
  const mes = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "")
    ? `${searchParams.mes}-01`
    : primeiroDiaDoMes(hojeIso());
  const dados = await refidelizacaoDoMes(mes);

  return (
    <>
      <CabecalhoPagina
        titulo="Refidelização — Setor de Atendimento"
        descricao={`Só comissiona aditivo aprovado no SGP e com as duas assinaturas no SGPsign. Meta de ${META_REFIDELIZACAO} planos; a base é o valor mensal, não o desconto.`}
      />

      <form method="get" className="mb-4 flex items-end gap-2">
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

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Planos refidelizados"
          valor={formatarNumero(dados.totais.validos)}
          contexto="aprovados e assinados"
        />
        <CartaoKpi
          rotulo="Aguardando assinatura"
          valor={formatarNumero(dados.totais.pendentes)}
          contexto={dados.totais.pendentes > 0 ? "resolva antes do fechamento" : "nada pendente"}
          tom={dados.totais.pendentes > 0 ? "amarelo" : "verde"}
        />
        <CartaoKpi rotulo="VTV refidelizado" valor={formatarMoeda(dados.totais.vtv)} />
        <CartaoKpi rotulo="Comissão do setor" valor={formatarMoeda(dados.totais.comissao)} />
      </div>

      <PainelRefidelizacao dados={dados} />
    </>
  );
}
