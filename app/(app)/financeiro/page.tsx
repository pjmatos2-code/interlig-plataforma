import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { CartaoKpi } from "@/components/dashboard/cartao-kpi";
import { Card, CardContent } from "@/components/ui/card";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import {
  competenciaFinanceiro,
  competenciasFechadas,
  apuracaoEmAndamento,
} from "@/lib/comissao/financeiro";
import { hojeIso, primeiroDiaDoMes } from "@/lib/datas";
import { PainelFinanceiro } from "./painel";
import { PainelApuracao } from "./apuracao";

export const dynamic = "force-dynamic";

const mesBr = (iso: string) => {
  const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const [a, m] = iso.slice(0, 7).split("-");
  return `${meses[Number(m) - 1]}/${a}`;
};

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: { mes?: string; agente?: string; aba?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "financeiro"]);
  const fechadas = await competenciasFechadas();
  const mesCorrente = primeiroDiaDoMes(hojeIso());
  const emApuracao = searchParams.aba === "apuracao";

  if (fechadas.length === 0) {
    const apuracao = await apuracaoEmAndamento(mesCorrente);
    return (
      <>
        <CabecalhoPagina
          titulo="Financeiro — comissões"
          descricao="Pagamento sobre competência fechada."
        />
        <Card className="mb-4">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhuma competência fechada ainda. O pagamento só é liberado depois que a
            Administração fecha o mês em <strong>Metas e comissão</strong> — assim o valor
            para de mudar e o demonstrativo entregue continua válido. Abaixo, a apuração do
            mês corrente para acompanhamento.
          </CardContent>
        </Card>
        <PainelApuracao dados={apuracao} />
      </>
    );
  }

  const mes = fechadas.includes(`${searchParams.mes}-01`)
    ? `${searchParams.mes}-01`
    : fechadas[0];
  const dados = await competenciaFinanceiro(mes);
  const apuracao = emApuracao ? await apuracaoEmAndamento(mesCorrente) : null;

  // filtro por agente: o financeiro confere um a um sem perder o resto de vista
  const agentes = dados.linhas
    .map((l) => ({ id: l.vendedorId, nome: l.vendedora }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const filtrado = searchParams.agente
    ? {
        ...dados,
        linhas: dados.linhas.filter((l) => l.vendedorId === searchParams.agente),
      }
    : dados;

  return (
    <>
      <CabecalhoPagina
        titulo="Financeiro — comissões"
        descricao="Valores congelados no fechamento. Confira, baixe o demonstrativo de cada agente e registre o pagamento."
      />

      <div className="mb-4 flex gap-1 border-b">
        <a
          href={`/financeiro?mes=${mes.slice(0, 7)}`}
          className={`px-4 py-2 text-sm font-medium ${
            emApuracao
              ? "text-muted-foreground hover:text-foreground"
              : "-mb-px border-b-2 border-primary text-foreground"
          }`}
        >
          A pagar (fechado)
        </a>
        <a
          href={`/financeiro?mes=${mes.slice(0, 7)}&aba=apuracao`}
          className={`px-4 py-2 text-sm font-medium ${
            emApuracao
              ? "-mb-px border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Em apuração (mês corrente)
        </a>
      </div>

      {!emApuracao && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
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
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Agente</span>
            <select
              name="agente"
              defaultValue={searchParams.agente ?? ""}
              className="h-9 min-w-[12rem] rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Todas</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Aplicar
          </button>
          {searchParams.agente && (
            <a
              href={`/financeiro?mes=${mes.slice(0, 7)}`}
              className="h-9 rounded-md border px-3 text-sm font-medium leading-9 hover:bg-muted"
            >
              Limpar
            </a>
          )}
        </form>
      )}

      {emApuracao && apuracao ? (
        <PainelApuracao dados={apuracao} />
      ) : (
      <>
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
        dados={filtrado}
        podeMarcar={usuario.perfil === "gestor" || usuario.perfil === "financeiro"}
      />
      </>
      )}
    </>
  );
}
