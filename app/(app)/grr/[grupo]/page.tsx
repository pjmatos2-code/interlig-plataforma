import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { AreasGrr } from "@/components/grr/areas";
import { CartaoIndicador } from "@/components/grr/cartao-indicador";
import { COLUNAS_DO_GRUPO, EvolucaoSemanas, ListaTickets, METRICA_DO_GRUPO, METRICA_SAFRA, Numeros, TabelaQuebra } from "@/components/grr/detalhes";
import { FiltrosRecorte, SeletorSemana } from "@/components/grr/painel/controles";
import { FaixaCongelamento } from "@/components/grr/formularios";
import { PainelDiagnostico } from "@/components/grr/planos/painel-diagnostico";
import { chaveDoEscopo } from "@/lib/grr/fotos";
import { diagnosticosDaSemana, listarPlanos, nomesDeUsuarios, responsaveisPossiveis } from "@/lib/grr/planos-dados";
import { recortesDePlano, valorDoRecorte } from "@/lib/grr/recortes";
import { hojeSantarem } from "@/lib/relatorio-semanal/periodo";
import { grupoPorChave, type GrupoGrr } from "@/lib/grr/catalogo";
import type { DadosGrr, LinhaQuebra } from "@/lib/grr/montar";
import { dec1, num, pct, reais, reais2 } from "@/lib/relatorio-semanal/formato";
import { diaMes } from "@/lib/relatorio-semanal/periodo";
import { carregarTelaGrr, parametrosDaTela, type ParametrosGrr } from "../carregar";

export const dynamic = "force-dynamic";

const traco = "—";

/** mediana em minutos → "35 min" ou "2 h 10 min" */
function duracao(min: number | null): string {
  if (min == null) return traco;
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function numerosDoGrupo(grupo: GrupoGrr, d: DadosGrr): { rotulo: string; valor: string; nota?: string }[] {
  const mesmoTrecho = d.trechos.emAndamento ? `segunda a ${diaMes(d.trechos.anterior.ate)}` : "semana completa";
  if (grupo === "vendas")
    return [
      { rotulo: "Vendas da semana", valor: num(d.vendas.semana) },
      { rotulo: "Semana anterior", valor: num(d.vendas.anterior), nota: mesmoTrecho },
      { rotulo: "Meta da semana", valor: d.vendas.metaSemana != null ? num(Math.round(d.vendas.metaSemana)) : traco, nota: "meta do mês pelos dias de expediente" },
      { rotulo: `Vendas de ${d.mes.nome}`, valor: num(d.vendas.mes) },
      { rotulo: "Meta do mês", valor: d.vendas.metaMes != null ? num(d.vendas.metaMes) : traco },
      { rotulo: "Atingimento do mês", valor: d.vendas.atingimentoMes != null ? pct(d.vendas.atingimentoMes) : traco, nota: d.vendas.esperadoMes != null ? `esperado até ontem: ${num(Math.round(d.vendas.esperadoMes))}` : undefined },
      { rotulo: "Prefeitura e rede neutra", valor: `${num(d.vendas.foraSemana)} na semana`, nota: `${num(d.vendas.foraMes)} no mês · fora da conta, o Dashboard soma` },
      { rotulo: "Vendas sem agente", valor: num(d.vendas.semVendedorSemana), nota: "contrato sem vendedor no SGP" },
    ];
  if (grupo === "ativacoes") {
    const e = d.ativacoes.instalacaoEfetiva;
    return [
      { rotulo: "Ativações na semana", valor: num(d.ativacoes.semana) },
      { rotulo: "Semana anterior", valor: num(d.ativacoes.anterior), nota: mesmoTrecho },
      { rotulo: "Da venda à ativação", valor: d.ativacoes.diasVendaAtivacao != null ? `${dec1(d.ativacoes.diasVendaAtivacao)} dias` : traco, nota: `média das ativadas na semana · ${num(d.ativacoes.noDiaDaVenda)} com a data igual à da venda` },
      { rotulo: "Receita dos contratos ativados", valor: reais(d.ativacoes.receitaAtivada) },
      { rotulo: "Aguardando instalação (hoje)", valor: num(d.ativacoes.aguardandoRecentes), nota: `vendas dos últimos 60 dias · ${num(d.ativacoes.aguardandoDaSemana)} da semana` },
      { rotulo: "Paradas há mais de 7 dias", valor: num(d.ativacoes.paradasMais7Dias), nota: "vendas dos últimos 60 dias" },
      { rotulo: "Cadastros antigos sem ativação", valor: num(d.ativacoes.aguardando - d.ativacoes.aguardandoRecentes), nota: "vendas de mais de 60 dias, assinadas e sem ativação registrada" },
      { rotulo: "Sem assinar, da semana", valor: num(d.ativacoes.semAssinarDaSemana), nota: `${num(d.ativacoes.acima48hDaSemana)} há 48h ou mais` },
      { rotulo: "Sem assinar, de vendas antigas", valor: num(d.ativacoes.antigasSemAssinar) },
      { rotulo: "Instaladas em até 15 dias", valor: e.taxa != null ? pct(e.taxa) : traco, nota: `${num(e.instaladas)} de ${num(e.base)} vendas de 15 a 45 dias atrás` },
    ];
  }
  if (grupo === "conversao")
    return [
      { rotulo: "Conversão por safra", valor: d.conversao.safra.taxa != null ? pct(d.conversao.safra.taxa) : traco, nota: `semana anterior: ${d.conversao.safra.taxaAnterior != null ? pct(d.conversao.safra.taxaAnterior) : traco}` },
      { rotulo: "Leads atendidos da safra", valor: num(d.conversao.safra.atendidos), nota: `${num(d.conversao.safra.leads)} leads chegaram no trecho` },
      { rotulo: "Viraram venda", valor: num(d.conversao.safra.convertidos), nota: `${num(d.conversao.safra.perdidos)} perdidos · ${num(d.conversao.safra.emNegociacao)} ainda em negociação` },
      { rotulo: "Fora da conta por safra", valor: num(d.conversao.safra.semAtendimentoPrevio + d.conversao.safra.repetidos), nota: `${num(d.conversao.safra.semAtendimentoPrevio)} de venda direta no SGP · ${num(d.conversao.safra.repetidos)} tickets repetidos do mesmo lead` },
      { rotulo: "Leads recebidos", valor: num(d.conversao.recebidos), nota: `semana anterior: ${num(d.conversao.recebidosAnterior)} · conta do painel do CRM` },
      { rotulo: "Em negociação (hoje)", valor: num(d.conversao.emNegociacao), nota: `${num(d.conversao.novosSemAtendimento)} ainda sem atendimento` },
      { rotulo: "Tickets fechados", valor: num(d.conversao.fechados) },
      { rotulo: "Convertidos", valor: num(d.conversao.convertidos) },
      { rotulo: "Conversão do CRM", valor: d.conversao.taxa != null ? pct(d.conversao.taxa) : traco, nota: `semana anterior: ${d.conversao.taxaAnterior != null ? pct(d.conversao.taxaAnterior) : traco}` },
      { rotulo: "Fora da conversão", valor: num(d.conversao.foraDaConversao), nota: "já é cliente da base ou transferido" },
      { rotulo: "Convertidas de venda direta no SGP", valor: num(d.conversao.convertidasSemLead), nota: "sem atendimento no CRM; contam só na conversão do CRM" },
    ];
  if (grupo === "receita")
    return [
      { rotulo: "Receita nova da semana", valor: reais(d.receita.semana), nota: "soma das mensalidades vendidas" },
      { rotulo: "Semana anterior", valor: reais(d.receita.anterior), nota: mesmoTrecho },
      { rotulo: `Receita nova de ${d.mes.nome}`, valor: reais(d.receita.mes) },
      { rotulo: "Ticket médio da semana", valor: d.receita.ticket != null ? reais2(d.receita.ticket) : traco },
      { rotulo: "Ticket médio da semana anterior", valor: d.receita.ticketAnterior != null ? reais2(d.receita.ticketAnterior) : traco },
      { rotulo: `Ticket médio de ${d.mes.nome}`, valor: d.receita.ticketMes != null ? reais2(d.receita.ticketMes) : traco },
      { rotulo: "Receita dos contratos ativados", valor: reais(d.ativacoes.receitaAtivada), nota: "ativados na semana" },
    ];
  if (grupo === "perdas")
    return [
      { rotulo: "Perdidos na semana", valor: num(d.perdas.perdidos), nota: `semana anterior: ${num(d.perdas.perdidosAnterior)}` },
      { rotulo: "Em negociação (hoje)", valor: num(d.conversao.emNegociacao) },
      { rotulo: "Retornos vencidos (hoje)", valor: num(d.perdas.retornosVencidos) },
      { rotulo: "Retornos para hoje", valor: num(d.perdas.retornosHoje) },
      { rotulo: "Retornos agendados", valor: num(d.perdas.retornosFuturos) },
      { rotulo: "Retornos feitos na semana", valor: num(d.perdas.retornosFeitosSemana), nota: "ações agendadas concluídas e follow-ups registrados; o retorno simples do ticket não guarda a conclusão" },
      { rotulo: "Primeira resposta", valor: duracao(d.perdas.primeiraRespostaMin), nota: "mediana dos leads da semana" },
    ];
  return [];
}

export default async function GrrGrupoPage({ params, searchParams }: { params: { grupo: string }; searchParams: ParametrosGrr }) {
  const grupo = grupoPorChave(params.grupo);
  if (!grupo) notFound();
  const { usuario, semana, rotuloDaSemana, vizinhas, escopo, dados, filtros, congelamento, cadastro } = await carregarTelaGrr(searchParams);
  // Etapa 3: diagnóstico e planos do recorte da tela, para os indicadores do grupo em atenção ou crítico
  const chave = chaveDoEscopo(escopo, usuario.id);
  const recorteDaTela = valorDoRecorte(chave);
  const podeEscrever = recortesDePlano(usuario, cadastro).some((x) => valorDoRecorte(x) === recorteDaTela);
  const doRecorte = <T extends { escopo_tipo: string; escopo_ref: string | null }>(x: T) => x.escopo_tipo === chave.tipo && (x.escopo_ref ?? null) === (chave.ref ?? null);
  const [diagnosticos, planosVisiveis, responsaveis] = await Promise.all([diagnosticosDaSemana(semana.inicio), listarPlanos(), responsaveisPossiveis()]);
  const versoesDoRecorte = diagnosticos.lista.filter(doRecorte);
  const planosDoRecorte = planosVisiveis.planos.filter((p) => doRecorte(p) && p.aprovacao !== "rejeitado" && p.situacao !== "cancelada");
  const nomesDiag = await nomesDeUsuarios(versoesDoRecorte.map((d) => d.criado_por));
  const CAMINHO = `/grr/${grupo.chave}`;
  const q = parametrosDaTela(searchParams);
  const colunas = COLUNAS_DO_GRUPO[grupo.chave];
  const metrica = METRICA_DO_GRUPO[grupo.chave];
  const cartoes = dados.cartoes.filter((c) => c.grupo === grupo.chave);
  const numeros = numerosDoGrupo(grupo.chave, dados);
  const donos = cartoes.filter((c) => c.dono).map((c) => `${c.rotulo}: ${c.dono}`);
  const abre = (trocas: Parameters<typeof parametrosDaTela>[1]) => `/grr/${grupo.chave}${parametrosDaTela(searchParams, trocas)}`;
  const ehAgente = (l: LinhaQuebra) => escopo.agentesDisponiveis.some((v) => v.id === l.id);
  const tickets =
    grupo.chave === "perdas" ? dados.tickets.filter((t) => t.situacao === "perdido" || t.situacao === "aberto") : grupo.chave === "conversao" || grupo.chave === "produtividade" ? dados.tickets : [];
  const maiorMotivo = Math.max(1, ...dados.perdas.motivos.map((m) => m.quantidade));

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href={`/grr${q}`} className="text-interlig-azul hover:underline">
          ← Resumo executivo
        </Link>
      </p>
      <CabecalhoPagina titulo={grupo.titulo} descricao={`${grupo.descricao} · ${escopo.rotulo} · semana de ${rotuloDaSemana}`} />
      <AreasGrr ativa="resumo" parametros={q} gestor={usuario.perfil === "gestor"} />
      <div className="mb-3 sm:max-w-md">
        <SeletorSemana semana={{ rotulo: rotuloDaSemana, tipo: semana.tipo, emAndamento: dados.trechos.emAndamento }} vizinhas={vizinhas} />
      </div>
      <FiltrosRecorte {...filtros} rotuloFixo={escopo.rotulo} />
      <FaixaCongelamento
        semanaInicio={semana.inicio}
        {...congelamento}
        podeCongelar={false}
        linkVivo={`${CAMINHO}${parametrosDaTela(searchParams, { vivo: "1" })}`}
        linkFoto={`${CAMINHO}${parametrosDaTela(searchParams, { vivo: null })}`}
      />

      {grupo.etapa !== 1 ? (
        <div className="rounded-xl border border-dashed bg-card p-4 text-sm">
          <p className="font-medium">Previsto na Etapa {grupo.etapa}</p>
          <p className="mt-1 text-muted-foreground">{grupo.regra}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cartoes.map((c) => (
              <CartaoIndicador key={c.chave} cartao={c} href={abre({})} />
            ))}
          </div>

          {diagnosticos.disponivel && (
            <PainelDiagnostico
              desvios={cartoes.filter((c) => c.status === "atencao" || c.status === "critico")}
              versoes={versoesDoRecorte}
              planos={planosDoRecorte}
              contexto={{ semana: semana.inicio, recorte: recorteDaTela }}
              podeEscrever={podeEscrever}
              responsaveis={responsaveis}
              nomes={nomesDiag}
              hoje={hojeSantarem()}
            />
          )}

          <div className="rounded-xl border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Como é calculado.</span> {grupo.regra}
            {donos.length > 0 && (
              <>
                {" "}
                <span className="font-medium text-foreground">Dono:</span> {donos.join("; ")}.
              </>
            )}
          </div>
          {!congelamento.aoVivo && (grupo.chave === "conversao" || grupo.chave === "perdas" || grupo.chave === "produtividade") && (
            <p className="text-xs text-muted-foreground">A lista de tickets não entra na foto. Para ver os tickets da semana, abra os números de agora.</p>
          )}

          {numeros.length > 0 && <Numeros itens={numeros} />}

          {grupo.chave === "perdas" && dados.perdas.motivos.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <h3 className="text-sm font-semibold">Motivos de perda da semana</h3>
              <ol className="mt-3 space-y-1.5">
                {dados.perdas.motivos.map((m) => (
                  <li key={m.motivo} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-2 text-xs">
                    <span className="truncate">{m.motivo}</span>
                    <span className="h-3 rounded-sm bg-muted">
                      <span className="block h-3 rounded-sm bg-interlig-azul" style={{ width: `${Math.max(3, (m.quantidade / maiorMotivo) * 100)}%` }} />
                    </span>
                    <span className="text-right font-medium tabular-nums">{num(m.quantidade)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {grupo.chave === "conversao" && <EvolucaoSemanas pontos={dados.evolucao} metrica={METRICA_SAFRA} foco={semana.inicio} />}
          {metrica && <EvolucaoSemanas pontos={dados.evolucao} metrica={metrica} foco={semana.inicio} />}

          <TabelaQuebra
            titulo="Por unidade"
            nota="Unidade do contrato ou do ticket."
            linhas={dados.porUnidade}
            colunas={colunas}
            link={(l) => (escopo.podeFiltrar.unidade && l.id !== "sem-unidade" ? abre({ unidade: l.id, equipe: null, agente: null }) : null)}
          />
          <TabelaQuebra
            titulo="Por equipe"
            nota="Equipe e apoio de cada coordenador; uma agente pode aparecer em mais de uma."
            linhas={dados.porEquipe}
            colunas={colunas}
            link={(l) => abre({ equipe: l.id, unidade: null, agente: null })}
          />
          <TabelaQuebra titulo="Por agente" linhas={dados.porAgente} colunas={colunas} sempre={ehAgente} link={(l) => (escopo.podeFiltrar.agente && ehAgente(l) ? abre({ agente: l.id }) : null)} />

          <ListaTickets
            tickets={tickets}
            titulo={grupo.chave === "perdas" ? "Perdidos e em negociação da semana" : "Tickets que compõem a semana"}
            nota={congelamento.aoVivo ? "Fechados no trecho e leads recebidos no trecho. O nome abre a ficha no CRM." : undefined}
          />
        </div>
      )}
    </div>
  );
}
