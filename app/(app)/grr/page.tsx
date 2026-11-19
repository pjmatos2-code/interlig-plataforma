import Link from "next/link";
import { AreasGrr } from "@/components/grr/areas";
import { FaixaCongelamento } from "@/components/grr/formularios";
import { CabecalhoGrr } from "@/components/grr/painel/cabecalho";
import { FiltrosRecorte, SeletorSemana } from "@/components/grr/painel/controles";
import { CartaoDestaque } from "@/components/grr/painel/destaque";
import { GraficoEvolucaoVendas } from "@/components/grr/painel/grafico-evolucao";
import { CartaoAlertas, CartaoPlanos, CartaoProximaReuniao } from "@/components/grr/painel/lateral";
import { RoscaSituacao } from "@/components/grr/painel/rosca";
import { TabelaIndicadores } from "@/components/grr/painel/tabela";
import { GRUPOS_GRR } from "@/lib/grr/catalogo";
import { chaveDoEscopo } from "@/lib/grr/fotos";
import { lerFoto } from "@/lib/grr/fotos-dados";
import { alertasDoResumo, destaquesDoResumo, pontosDoGrafico, situacaoDosIndicadores, tabelaDeIndicadores } from "@/lib/grr/painel";
import { lerReuniaoDaSemana, PERFIS_RELATORIO } from "@/lib/grr/reuniao-dados";
import { rotuloSemana, ultimaSemanaCompleta } from "@/lib/relatorio-semanal/periodo";
import { carregarTelaGrr, parametrosDaTela, type ParametrosGrr } from "./carregar";

export const dynamic = "force-dynamic";

/**
 * GRR Comercial — Resumo executivo. Semana atual por padrão, comparada com a
 * anterior; a reunião usa a última semana completa. Os números vêm das regras
 * oficiais (lib/grr/montar.ts); esta tela só organiza: destaques, evolução,
 * situação dos indicadores, tabela dos sete grupos e a coluna de gestão.
 */
export default async function GrrPage({ searchParams }: { searchParams: ParametrosGrr }) {
  const { usuario, hoje, semana, rotuloDaSemana, vizinhas, escopo, dados, filtros, congelamento, config } = await carregarTelaGrr(searchParams);
  const CAMINHO = "/grr";
  const q = parametrosDaTela(searchParams);

  // reunião de segunda: a da última semana completa (registrada no Relatório da diretoria)
  const ultima = ultimaSemanaCompleta(hoje);
  const mesmaSemana = ultima.inicio === semana.inicio;
  const [reuniaoDaSemana, reuniaoUltima, fotoUltima] = await Promise.all([
    lerReuniaoDaSemana(semana.inicio, usuario.perfil),
    mesmaSemana ? null : lerReuniaoDaSemana(ultima.inicio, usuario.perfil),
    mesmaSemana || !config.disponivel ? null : lerFoto(ultima, chaveDoEscopo(escopo, usuario.id)),
  ]);
  const reuniao = mesmaSemana ? reuniaoDaSemana : reuniaoUltima;
  const acessoRelatorio = PERFIS_RELATORIO.includes(usuario.perfil);
  const qUltima = parametrosDaTela(searchParams, { semana: ultima.inicio, vivo: null });

  const destaques = destaquesDoResumo(dados);
  const situacao = situacaoDosIndicadores(dados.cartoes);
  const grupos = tabelaDeIndicadores(dados);
  const alertas = alertasDoResumo(dados);
  const pontos = pontosDoGrafico(dados);

  return (
    <div>
      <CabecalhoGrr
        subtitulo={`Comercial · ${escopo.rotulo}`}
        periodo={<SeletorSemana semana={{ rotulo: rotuloDaSemana, tipo: semana.tipo, emAndamento: dados.trechos.emAndamento }} vizinhas={vizinhas} />}
        hrefPdf={reuniaoDaSemana ? `/api/relatorios/semanal/${reuniaoDaSemana.relatorioId}/pdf` : null}
        hrefApresentar={`/apresentacao/grr${q}`}
      />
      <AreasGrr ativa="resumo" parametros={q} gestor={usuario.perfil === "gestor"} />
      <FiltrosRecorte {...filtros} rotuloFixo={escopo.rotulo} />
      <FaixaCongelamento
        semanaInicio={semana.inicio}
        {...congelamento}
        linkVivo={`${CAMINHO}${parametrosDaTela(searchParams, { vivo: "1" })}`}
        linkFoto={`${CAMINHO}${parametrosDaTela(searchParams, { vivo: null })}`}
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {destaques.map((c) => (
              <CartaoDestaque key={c.chave} cartao={c} href={`/grr/${c.grupo}${q}`} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-evolucao">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="t-evolucao" className="text-base font-semibold tracking-tight">
                  Evolução das vendas
                </h2>
                <p className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-interlig-azul" aria-hidden /> semana analisada
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm bg-interlig-claro" aria-hidden /> anteriores
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 border-t-2 border-dashed border-orange-700" aria-hidden /> meta da semana
                  </span>
                </p>
              </div>
              <GraficoEvolucaoVendas dados={pontos} />
              <p className="mt-1 text-xs text-muted-foreground">Últimas 8 semanas, de segunda a domingo. Passe o mouse para ver ativações e conversão.</p>
            </section>
            <section className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-situacao">
              <h2 id="t-situacao" className="mb-3 text-base font-semibold tracking-tight">
                Situação dos indicadores ({situacao.total})
              </h2>
              <RoscaSituacao situacao={situacao} gruposSemDados={GRUPOS_GRR.filter((g) => g.etapa !== 1).length} />
            </section>
          </div>

          <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-labelledby="t-indicadores">
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
              <h2 id="t-indicadores" className="text-base font-semibold tracking-tight">
                Indicadores do período
              </h2>
              <p className="text-xs text-muted-foreground">Semana de {rotuloDaSemana}, comparada à semana anterior.</p>
            </div>
            <TabelaIndicadores grupos={grupos} parametros={q} />
          </section>

          {dados.avisos.length > 0 && (
            <section className="rounded-2xl border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground" aria-label="Observações sobre os dados">
              <p className="mb-1 font-medium text-foreground">Observações sobre os dados</p>
              <ul className="space-y-1">
                {dados.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1" aria-label="Gestão">
          <CartaoProximaReuniao
            r={{
              semanaRotulo: rotuloSemana(ultima),
              data: reuniao?.reuniao["reuniao-data"] || null,
              participantes: reuniao?.reuniao["reuniao-quem"] || null,
              relatorio: !acessoRelatorio ? "sem_acesso" : reuniao ? "gerado" : "nao_gerado",
              congelada: mesmaSemana ? !!congelamento.foto : !!fotoUltima,
              hrefApresentar: `/apresentacao/grr${qUltima}`,
              hrefPreparar: reuniao ? `/relatorios/semanal/${reuniao.relatorioId}` : acessoRelatorio ? "/relatorios" : null,
            }}
          />
          <CartaoAlertas alertas={alertas} parametros={q} />
          <CartaoPlanos combinado={acessoRelatorio ? reuniao?.combinadoAnterior ?? [] : null} hrefRelatorio={reuniao ? `/relatorios/semanal/${reuniao.relatorioId}` : null} />
        </aside>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        As contas são as regras oficiais da plataforma. A meta de vendas vem de Metas e comissão; as demais metas e faixas são definidas na configuração do GRR. Estoques
        (instalações, negociações e retornos) mostram a situação do dia em que os números foram lidos.{" "}
        {usuario.perfil === "gestor" && (
          <Link href="/grr/configuracao" className="font-medium text-interlig-azul hover:underline">
            Configurar indicadores e metas
          </Link>
        )}
      </p>
    </div>
  );
}
