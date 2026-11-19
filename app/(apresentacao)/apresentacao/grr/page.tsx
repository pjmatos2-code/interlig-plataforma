import { ApresentacaoGrr } from "@/components/grr/apresentacao/apresentacao";
import { GRUPOS_GRR } from "@/lib/grr/catalogo";
import { alertasDoResumo, destaquesDoResumo, paraPainel, pontosDoGrafico, situacaoDosIndicadores } from "@/lib/grr/painel";
import { lerReuniaoDaSemana } from "@/lib/grr/reuniao-dados";
import { diagnosticosAtuais } from "@/lib/grr/planos";
import { diagnosticosDaSemana, listarPlanos } from "@/lib/grr/planos-dados";
import { hojeSantarem } from "@/lib/relatorio-semanal/periodo";
import { carregarRotinas } from "@/lib/grr/rotinas-dados";
import { notFound } from "next/navigation";
import { exigirPerfil } from "@/lib/auth";
import { lerAta } from "@/lib/grr/reunioes";
import { lerReuniao } from "@/lib/grr/reunioes-dados";
import { carregarTelaGrr, parametrosDaTela, PERFIS_GRR, type ParametrosGrr } from "@/app/(app)/grr/carregar";

export const dynamic = "force-dynamic";

/**
 * Modo Apresentação do GRR Comercial: a semana e o recorte escolhidos no
 * painel, em oito seções para conduzir a reunião de resultados. Usa os
 * mesmos dados do painel (foto congelada quando existe) e o registro da
 * reunião que já existe no Relatório da diretoria. Abrir a apresentação não
 * grava nada; só o encerramento (direção e administração) congela a semana.
 */
export default async function ApresentacaoGrrPage({ searchParams: pedido }: { searchParams: ParametrosGrr & { reuniao?: string } }) {
  // ?reuniao=<id>: a reunião de resultados registrada no GRR define a semana e a abrangência
  await exigirPerfil([...PERFIS_GRR]);
  const lida = pedido.reuniao ? await lerReuniao(pedido.reuniao) : null;
  if (pedido.reuniao && (!lida || lida.reuniao.modalidade !== "diretoria")) notFound();
  const rg = lida?.reuniao ?? null;
  const searchParams: ParametrosGrr = rg ? { semana: rg.periodo_inicio, unidade: rg.escopo_tipo === "unidade" ? rg.escopo_ref ?? undefined : undefined } : pedido;
  const { usuario, semana, rotuloDaSemana, escopo, dados, congelamento } = await carregarTelaGrr(searchParams);
  const [reuniao, diagnosticos, planos, rotinas] = await Promise.all([
    lerReuniaoDaSemana(semana.inicio, usuario.perfil),
    diagnosticosDaSemana(semana.inicio),
    listarPlanos(),
    carregarRotinas([semana], usuario, semana).then((r) => r[0]?.lideres ?? []).catch(() => []),
  ]);
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
      diagnosticos={diagnosticosAtuais(diagnosticos.lista)}
      planos={planos.planos.filter((x) => x.aprovacao !== "rejeitado" && x.situacao !== "cancelada")}
      hoje={hojeSantarem()}
      rotinas={rotinas}
      diretoria={usuario.perfil === "gestor" || usuario.perfil === "direcao"}
      hrefVoltar={rg ? `/grr/reunioes/${rg.id}` : `/grr${parametrosDaTela(searchParams)}`}
      reuniaoGrr={
        rg
          ? { id: rg.id, data: rg.data_reuniao, participantes: rg.participantes.map((x) => x.nome), aberta: rg.situacao === "aberta", encerradaEm: rg.encerrada_em, ata: lerAta(rg.ata) }
          : null
      }
    />
  );
}
