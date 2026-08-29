import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { Card, CardContent } from "@/components/ui/card";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { competenciaFinanceiro, competenciasFechadas } from "@/lib/comissao/financeiro";
import { PainelFinanceiro } from "./painel";

export const dynamic = "force-dynamic";

const mesBr = (iso: string) => {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const [a, m] = iso.slice(0, 7).split("-");
  return `${meses[Number(m) - 1]}/${a}`;
};

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: { mes?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "financeiro"]);
  const fechadas = await competenciasFechadas();

  if (fechadas.length === 0) {
    return (
      <>
        <CabecalhoPagina
          titulo="Financeiro — comissões"
          descricao="Pagamento sobre competência fechada."
        />
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma competência fechada ainda. O pagamento só é liberado depois que a
            Administração fecha o mês em <strong>Metas e comissão</strong> — assim o valor
            para de mudar e o demonstrativo entregue continua válido.
          </CardContent>
        </Card>
      </>
    );
  }

  const mes = fechadas.includes(`${searchParams.mes}-01`)
    ? `${searchParams.mes}-01`
    : fechadas[0];
  const dados = await competenciaFinanceiro(mes);

  return (
    <>
      <CabecalhoPagina
        titulo="Financeiro — comissões"
        descricao="Valores congelados no fechamento. Confira, baixe o demonstrativo de cada agente e registre o pagamento."
      />

      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Competência</span>
          <select
            name="mes"
            defaultValue={mes.slice(0, 7)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {fechadas.map((f) => (
              <option key={f} value={f.slice(0, 7)}>
                {mesBr(f)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          Abrir
        </button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <CartaoKpi rotulo="Agentes na competência" valor={formatarNumero(dados.totais.agentes)} />
        <CartaoKpi rotulo="Total a pagar" valor={formatarMoeda(dados.totais.valor)} />
        <CartaoKpi
          rotulo="Já pagos"
          valor={`${dados.totais.pagos}/${dados.totais.agentes}`}
          contexto={formatarMoeda(dados.totais.valorPago)}
          tom={dados.totais.pagos === dados.totais.agentes ? "verde" : undefined}
        />
        <CartaoKpi
          rotulo="Falta pagar"
          valor={formatarMoeda(dados.totais.valor - dados.totais.valorPago)}
          contexto={`${dados.totais.agentes - dados.totais.pagos} agente(s)`}
          tom={dados.totais.pagos < dados.totais.agentes ? "amarelo" : undefined}
        />
      </div>

      <PainelFinanceiro
        dados={dados}
        podeMarcar={usuario.perfil === "gestor" || usuario.perfil === "financeiro"}
      />
    </>
  );
}
