import { ApresentacaoGrr } from "@/components/grr/apresentacao/apresentacao";
import { GRUPOS_GRR } from "@/lib/grr/catalogo";
import { alertasDoResumo, destaquesDoResumo, paraPainel, pontosDoGrafico, situacaoDosIndicadores } from "@/lib/grr/painel";
import { lerReuniaoDaSemana } from "@/lib/grr/reuniao-dados";
import { carregarTelaGrr, parametrosDaTela, type ParametrosGrr } from "@/app/(app)/grr/carregar";

export const dynamic = "force-dynamic";

/**
 * Modo Apresentação do GRR Comercial: a semana e o recorte escolhidos no
 * painel, em oito seções para conduzir a reunião de resultados. Usa os
 * mesmos dados do painel (foto congelada quando existe) e o registro da
 * reunião que já existe no Relatório da diretoria. Abrir a apresentação não
 * grava nada; só o encerramento (direção e administração) congela a semana.
 */
export default async function ApresentacaoGrrPage({ searchParams }: { searchParams: ParametrosGrr }) {
  const { usuario, semana, rotuloDaSemana, escopo, dados, congelamento } = await carregarTelaGrr(searchParams);
  const reuniao = await lerReuniaoDaSemana(semana.inicio, usuario.perfil);
  // a lista de tickets não vai para a tela de apresentação (nomes de clientes)
  const { tickets: _tickets, ...semTickets } = dados;
  void _tickets;
  const desvios = dados.cartoes.filter((c) => c.status === "atencao" || c.status === "critico").map((c) => paraPainel(c, dados));

  return (
    <ApresentacaoGrr
      dados={semTickets}
      escopoRotulo={escopo.rotulo}
      semana={{ inicio: semana.inicio, rotulo: rotuloDaSemana, completa: congelamento.completa, emAndamento: dados.trechos.emAndamento }}
      congelamento={congelamento}
      destaques={destaquesDoResumo(dados)}
      todos={dados.cartoes.map((c) => paraPainel(c, dados))}
      desvios={desvios}
      situacao={situacaoDosIndicadores(dados.cartoes)}
      gruposSemDados={GRUPOS_GRR.filter((g) => g.etapa !== 1).length}
      alertas={alertasDoResumo(dados, 4)}
      pontos={pontosDoGrafico(dados)}
      reuniao={reuniao}
      podeEditarReuniao={usuario.perfil === "gestor" || usuario.perfil === "direcao"}
      hrefVoltar={`/grr${parametrosDaTela(searchParams)}`}
    />
  );
}
