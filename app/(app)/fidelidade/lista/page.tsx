import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { exigirPerfil } from "@/lib/auth";
import {
  FAIXAS_FIDELIDADE,
  UNIDADES_FIDELIDADE,
  escopoFidelidade,
  familiasDoFiltro,
  lerFiltroLista,
  lerListaFidelidade,
  lerResumoFidelidade,
  queryLista,
} from "@/lib/sgp/fidelidade";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { dataHora } from "@/components/comissao/cartao-resultado-agente";
import { cn } from "@/lib/utils";
import { BotaoAtualizarFidelidade } from "../botao";
import { TabelaClientes } from "./tabela";

export const dynamic = "force-dynamic";

const num = (v: number) => v.toLocaleString("pt-BR");

/**
 * Lista nominal da fidelidade da base (pedido do Paulo, 04/11/2026): o
 * número de um plano no gráfico abre aqui quem são os clientes — nome,
 * telefone, plano, mensalidade e fim da fidelidade —, com link para o SGP,
 * WhatsApp e a planilha. Os contratos vêm da última leitura do relatório
 * Fidelidades do SGP (os mesmos do gráfico, já sem permutas, isentos e
 * órgãos públicos).
 */
export default async function ListaFidelidadePage({
  searchParams,
}: {
  searchParams: { faixa?: string; unidade?: string; plano?: string; outros?: string };
}) {
  const usuario = await exigirPerfil(["gestor", "direcao", "agente_atendimento", "supervisor"]);
  const escopo = await escopoFidelidade(usuario);
  if (!escopo) redirect("/dashboard");
  const filtro = lerFiltroLista(searchParams, escopo.unidadeFixa);
  const resumo = await lerResumoFidelidade();
  const { familias, noGrafico, titulo } = familiasDoFiltro(filtro, resumo);
  const [{ clientes, atualizadoEm }, template] = await Promise.all([
    lerListaFidelidade(filtro.faixa, filtro.pop, familias),
    templateLinkSgp(),
  ]);

  const faixa = FAIXAS_FIDELIDADE.find((f) => f.chave === filtro.faixa)!;
  const vencendo = filtro.faixa !== "sem";
  const nomeUnidade = filtro.pop ? UNIDADES_FIDELIDADE.find((u) => u.pop === filtro.pop)?.nome : null;
  const semTelefone = clientes.filter((c) => !c.telefone).length;
  const mostraGrupo = !filtro.plano; // "Outros" ou todos: o grupo muda de linha a linha
  const voltar = (() => {
    const q = new URLSearchParams();
    if (filtro.pop && !escopo.unidadeFixa) q.set("unidade", String(filtro.pop));
    if (filtro.faixa !== "sem") q.set("faixa", filtro.faixa);
    const qs = q.toString();
    return `/fidelidade${qs ? `?${qs}` : ""}#planos`;
  })();
  const chip = (ativo: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium",
      ativo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
    );

  return (
    <>
      <Link href={voltar} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Fidelidade da base
      </Link>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight lg:text-2xl">{titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {num(clientes.length)} {clientes.length === 1 ? "cliente ativo" : "clientes ativos"} · {faixa.rotulo.toLowerCase()} ·{" "}
            {nomeUnidade ?? "todas as unidades"}
            {semTelefone > 0 && ` · ${num(semTelefone)} sem telefone no cadastro`}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          {clientes.length > 0 && (
            <a
              href={`/api/fidelidade/exportar?${queryLista(filtro)}`}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90"
            >
              <Download className="h-4 w-4" /> Baixar planilha
            </a>
          )}
          <span className="text-xs text-muted-foreground">
            {atualizadoEm ? `Lista do SGP de ${dataHora(atualizadoEm)}` : "Lista ainda não lida do SGP"}
          </span>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {!escopo.unidadeFixa && (
          <div className="flex flex-wrap gap-1.5">
            <a href={`?${queryLista({ ...filtro, pop: null })}`} className={chip(!filtro.pop)}>Todas</a>
            {UNIDADES_FIDELIDADE.map((u) => (
              <a key={u.pop} href={`?${queryLista({ ...filtro, pop: u.pop })}`} className={chip(filtro.pop === u.pop)}>{u.nome}</a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          {FAIXAS_FIDELIDADE.map((f) => (
            <a key={f.chave} href={`?${queryLista({ ...filtro, faixa: f.chave })}`} className={chip(filtro.faixa === f.chave)}>{f.rotulo}</a>
          ))}
        </div>
      </div>

      {clientes.length > 0 && clientes.length !== noGrafico && (
        <p className="mb-4 rounded-lg border border-farol-amarelo/40 bg-farol-amarelo/10 p-3 text-sm">
          O gráfico mostra {num(noGrafico)} e a lista tem {num(clientes.length)}: a última leitura do SGP não terminou em
          todas as faixas. A próxima atualização acerta os dois.
        </p>
      )}

      {clientes.length === 0 ? (
        <section className="rounded-xl border bg-card p-6 text-center shadow-sm">
          {noGrafico > 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                A lista de clientes passa a ser guardada a partir da próxima leitura do SGP. Ela roda sozinha toda
                madrugada{escopo.unidadeFixa ? "" : ", ou agora, pelo botão abaixo (até 2 minutos)"}.
              </p>
              {!escopo.unidadeFixa && <BotaoAtualizarFidelidade />}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum cliente nesta seleção.</p>
          )}
        </section>
      ) : (
        <TabelaClientes clientes={clientes} vencendo={vencendo} mostraGrupo={mostraGrupo} template={template} />
      )}

      <p className="mt-4 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <b className="text-foreground">De onde vem:</b> os contratos são os do relatório Fidelidades do SGP na última
        leitura, sem permutas, isentos e órgãos públicos (os mesmos do gráfico). Nome, telefone e mensalidade vêm do
        cadastro da plataforma. O botão SGP abre os contratos do cliente — é preciso estar logada no SGP.
      </p>
    </>
  );
}
