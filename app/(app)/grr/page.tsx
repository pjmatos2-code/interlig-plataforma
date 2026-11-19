import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { CartaoIndicador } from "@/components/grr/cartao-indicador";
import { FiltrosGrr } from "@/components/grr/filtros";
import { GRUPOS_GRR } from "@/lib/grr/catalogo";
import { carregarTelaGrr, parametrosDaTela, type ParametrosGrr } from "./carregar";

export const dynamic = "force-dynamic";

/**
 * GRR Comercial — Resumo executivo (Etapa 1, só leitura). Semana atual por
 * padrão, comparada com a anterior; a reunião usa a última semana completa.
 * Cada cartão abre o detalhe do grupo, por unidade, equipe e agente.
 */
export default async function GrrPage({ searchParams }: { searchParams: ParametrosGrr }) {
  const { semana, rotuloDaSemana, vizinhas, escopo, dados, filtros } = await carregarTelaGrr(searchParams);
  const q = parametrosDaTela(searchParams);

  return (
    <div>
      <CabecalhoPagina titulo="GRR · Gestão de Resultados" descricao={`Comercial · ${escopo.rotulo} · semana de ${rotuloDaSemana}`} />
      <AreasGrr ativa="resumo" parametros={q} />
      <FiltrosGrr
        semana={{ rotulo: rotuloDaSemana, tipo: semana.tipo }}
        vizinhas={vizinhas}
        {...filtros}
      />

      {dados.avisos.length > 0 && (
        <ul className="mb-5 space-y-1 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          {dados.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="space-y-6">
        {GRUPOS_GRR.map((grupo) => {
          const cartoes = dados.cartoes.filter((c) => c.grupo === grupo.chave);
          return (
            <section key={grupo.chave} aria-labelledby={`grupo-${grupo.chave}`}>
              <div className="mb-2">
                <h2 id={`grupo-${grupo.chave}`} className="text-base font-semibold tracking-tight">
                  {grupo.titulo}
                </h2>
                <p className="text-xs text-muted-foreground">{grupo.descricao}</p>
              </div>
              {grupo.etapa === 1 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {cartoes.map((c) => (
                    <CartaoIndicador key={c.chave} cartao={c} href={`/grr/${grupo.chave}${q}`} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
                  <p className="font-medium">Previsto na Etapa {grupo.etapa}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{grupo.regra}</p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Painel em modo de leitura. As contas são as regras oficiais da plataforma; os cartões sem meta ganham meta e faixas na Etapa 2. Estoques (aguardando instalação,
        negociações e retornos) mostram a situação de hoje, mesmo em semanas passadas.
      </p>
    </div>
  );
}
