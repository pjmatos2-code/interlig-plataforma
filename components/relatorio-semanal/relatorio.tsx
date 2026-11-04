import type { DadosRelatorio, ItemPlacar, Reuniao, TextosRelatorio } from "@/lib/relatorio-semanal/tipos";
import { LIMITES, ROTULO_STATUS, contagemStatus } from "@/lib/relatorio-semanal/placar";
import { dataBr, diaMes, rotuloSemana } from "@/lib/relatorio-semanal/periodo";
import { dec1, lista, num, pct, plural, reais, reais2, reaisMil, sinal, variacao } from "@/lib/relatorio-semanal/formato";
import { CampoReuniao, PerguntasReuniao } from "./reuniao";
import { PerguntasPdf } from "./perguntas-pdf";

/**
 * Relatório Comercial Semanal — a página no formato do modelo aprovado pela
 * diretoria (faixa azul, placar, seções e perguntas da reunião). Recebe os
 * números e os textos já congelados no relatório gerado.
 */

const CLASSE_PILL = { ok: "ok", atencao: "warn", critico: "bad", sem_meta: "none" } as const;

const NAO_ENTREGA = [
  "Reativações da semana: a variação da base mostra ativações e cancelamentos, mas ainda não separa quem voltou depois de suspenso.",
  "Inadimplência da safra: dos clientes vendidos nos últimos 90 dias, quantos já atrasaram boleto.",
  "Funil por canal com custo por venda: depende de preencher a origem e do custo de cada campanha.",
];

function Pill({ status }: { status: ItemPlacar["status"] }) {
  return <span className={`pill ${CLASSE_PILL[status]}`}>{ROTULO_STATUS[status]}</span>;
}

function LinhaPlacar({ p }: { p: ItemPlacar }) {
  return (
    <div className="sc-row">
      <div className="sc-status"><Pill status={p.status} /></div>
      <div className="sc-ind">
        <strong>{p.indicador}</strong>
        <span>{p.subtitulo}</span>
      </div>
      <div className="sc-real">
        <span className="cell-label">Realizado</span>
        <b>{p.realizado}</b>
        {p.realizadoDetalhe && <small>{p.realizadoDetalhe}</small>}
      </div>
      <div className="sc-ref">
        <span className="cell-label">Meta ou referência</span>
        <b>{p.meta}</b>
        {p.metaDetalhe && <small>{p.metaDetalhe}</small>}
      </div>
      <div className="sc-own">
        <span className="cell-label">Dono</span>
        {p.dono}
      </div>
    </div>
  );
}

function TabelaPlacar({ itens }: { itens: ItemPlacar[] }) {
  return (
    <div className="sc">
      <div className="sc-head label">
        <span>Status</span>
        <span>Indicador</span>
        <span>Realizado</span>
        <span>Meta ou referência</span>
        <span>Dono</span>
      </div>
      {itens.map((p) => (
        <LinhaPlacar key={p.chave} p={p} />
      ))}
    </div>
  );
}

/** barra horizontal do modelo (rótulo, trilho, valor) */
function Barra({ nome, valor, max, rotulo, detalhe, tipo = "hit" }: { nome: string; valor: number; max: number; rotulo: string; detalhe?: string; tipo?: "hit" | "miss" }) {
  return (
    <div className="hrow">
      <span className="name">{nome}</span>
      <div className="track">
        <div className={tipo === "miss" ? "fill miss" : "fill"} style={{ width: `${Math.max(1.5, Math.min(100, (valor / Math.max(1, max)) * 100))}%` }} />
      </div>
      <span className="val">
        {rotulo}
        {detalhe && <small>{detalhe}</small>}
      </span>
    </div>
  );
}

export function RelatorioSemanal({
  id,
  dados: d,
  textos: t,
  reuniao,
  combinadoAnterior,
  podeEditar,
  voltar,
  pdf,
  modo = "tela",
}: {
  id: string;
  dados: DadosRelatorio;
  textos: TextosRelatorio | null;
  reuniao: Reuniao;
  /** checklist da reunião anterior (ação e responsável), para o "combinado" */
  combinadoAnterior: { acao: string; responsavel: string }[] | null;
  podeEditar: boolean;
  /** link de volta à plataforma (só para quem entrou logado) */
  voltar?: string;
  /** link para baixar o PDF (na tela) */
  pdf?: string;
  /** "pdf": a página que o servidor imprime para o e-mail — sem campos nem botões */
  modo?: "tela" | "pdf";
}) {
  const impressao = modo === "pdf";
  const { leitura: l, vendas: v } = d;
  const contagem = contagemStatus(d.placar);
  const mesRotulo = l.mes.fechado ? `${l.mes.nome[0].toUpperCase()}${l.mes.nome.slice(1)} fechado` : `${l.mes.nome[0].toUpperCase()}${l.mes.nome.slice(1)} até ${diaMes(l.semana.fim)}`;
  const lidoEm = new Date(l.lidoEm).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const semanaTxt = rotuloSemana(l.semana);

  // gráfico diário: a linha da meta fica na altura proporcional ao maior dia
  const maxDia = Math.max(1, v.metaDiaria ?? 0, ...v.porDia.map((x) => x.vendas));
  const altura = 150;
  const vendedores = [...v.porVendedor].sort((a, b) => b.vendasSemana - a.vendasSemana || b.vendasMes - a.vendasMes);
  const maxVendSemana = Math.max(1, ...vendedores.map((x) => x.vendasSemana));
  const pendentes48 = d.assinatura.pendentesSemana.filter((p) => p.idadeDias >= 2).sort((a, b) => b.idadeDias - a.idadeDias);
  const pendPorVend = new Map<string, { total: number; acima: number }>();
  for (const p of d.assinatura.pendentesSemana) {
    const k = p.vendedor ?? "Sem vendedor atribuído";
    const r = pendPorVend.get(k) ?? { total: 0, acima: 0 };
    r.total++;
    if (p.idadeDias >= 2) r.acima++;
    pendPorVend.set(k, r);
  }
  const b = d.base;
  const semanasRestantes = Math.max(1, b.diasRestantes / 7);
  const mesesRestantes = Math.max(1, Math.round(b.diasRestantes / 30.4));
  const varBase = b.ativosAnterior != null ? b.ativos - b.ativosAnterior : null;
  const f = d.debito;
  const maxFaixa = Math.max(1, ...f.faixas.map((x) => x.valor));

  return (
    <div className={impressao ? "rcs pdf" : "rcs"} data-theme={impressao ? "light" : undefined}>
      <header className="top">
        <div className="in">
          {!impressao && (voltar || pdf) && (
            <div className="top-links">
              {voltar && (
                <a href={voltar} className="voltar">
                  ← Relatórios da diretoria
                </a>
              )}
              {pdf && (
                <a href={pdf} className="voltar" target="_blank" rel="noopener">
                  Baixar PDF
                </a>
              )}
            </div>
          )}
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/marca/logo-fundo-escuro.png" alt="Interlig Internet Fibra" />
            <span className="brand-tag">· Inteligência Comercial</span>
          </div>
          <h1>Relatório Comercial Semanal</h1>
          <div className="top-meta">
            <span>Semana <b>{semanaTxt}</b></span>
            <span><b>{mesRotulo}</b> {dataBr(l.mes.de).slice(0, 5)} a {dataBr(l.mes.fechado ? l.mes.ate : l.semana.fim).slice(0, 5)}</span>
            <span>Preparado para <b>CEO</b></span>
            <span>Fonte <b>plataforma Interlig + SGP, lida em {lidoEm}</b></span>
          </div>
        </div>
      </header>

      <main>
        <div className="in">
          {/* ---------------- placar */}
          <section id="placar">
            <div className="sec-head">
              <h2>Placar da semana</h2>
              <p>
                Dez indicadores para cobrar o diretor comercial. Os sete primeiros o comercial controla. Os três últimos
                dependem de outras áreas, mas é ele quem leva o problema.
              </p>
            </div>
            <div className="verdict">
              <p>{t?.veredito ?? "Os textos do relatório ainda não foram escritos. Os números abaixo já estão prontos."}</p>
              <div className="tally">
                {contagem.critico > 0 && <span className="pill bad">{plural(contagem.critico, "crítico", "críticos")}</span>}
                {contagem.atencao > 0 && <span className="pill warn">{num(contagem.atencao)} em atenção</span>}
                {contagem.ok > 0 && <span className="pill ok">{num(contagem.ok)} ok</span>}
                {contagem.sem_meta > 0 && <span className="pill none">{plural(contagem.sem_meta, "sem meta definida", "sem meta definida")}</span>}
              </div>
            </div>
            <div className="group-title" style={{ marginTop: 22 }}>
              <h3>O que o comercial controla</h3>
            </div>
            <TabelaPlacar itens={d.placar.filter((p) => p.grupo === "comercial")} />
            <div className="group-title">
              <h3>O que depende de outras áreas</h3>
            </div>
            <TabelaPlacar itens={d.placar.filter((p) => p.grupo === "outras")} />
          </section>

          {/* ---------------- vendas */}
          <section id="vendas">
            <div className="sec-head">
              <h2>Vendas: ritmo, time e mix</h2>
              <p>Só vendas novas. As renovações da Refidelização aparecem separadas e não entram nas {num(v.semana)} da semana.</p>
            </div>
            <div className="grid2">
              <div className="panel">
                <h3>Vendas por dia na semana</h3>
                <p className="sub">
                  {semanaTxt} · {plural(v.semana, "venda", "vendas")}
                  {v.metaDiaria ? ` · meta diária de ${dec1(v.metaDiaria)}` : ""}
                </p>
                <div className="dchart">
                  <div className="plot" style={{ height: altura + 40 }}>
                    {v.metaDiaria ? (
                      <div className="metaline" style={{ bottom: (v.metaDiaria / maxDia) * altura }}>
                        <span>meta {dec1(v.metaDiaria)}</span>
                      </div>
                    ) : null}
                    {v.porDia.map((x) => (
                      <div key={x.data} className="col">
                        <span className="v">{num(x.vendas)}</span>
                        <span
                          className={v.metaDiaria && x.vendas >= v.metaDiaria ? "b hit" : "b"}
                          style={{ height: Math.max(x.vendas ? 4 : 0, (x.vendas / maxDia) * altura) }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="xl">
                    {v.porDia.map((x) => (
                      <span key={x.data}>
                        {x.rotulo}
                        {!x.expediente && <em>sem expediente</em>}
                      </span>
                    ))}
                  </div>
                </div>
                {v.metaDiaria ? (
                  <div className="legend">
                    <span><i style={{ background: "var(--bar-hit)" }} />Bateu a meta do dia</span>
                    <span><i style={{ background: "var(--bar-miss)" }} />Ficou abaixo</span>
                    <span>Linha tracejada: meta de {dec1(v.metaDiaria)}</span>
                  </div>
                ) : null}
              </div>
              <div className="panel">
                <h3>{l.mes.nome[0].toUpperCase() + l.mes.nome.slice(1)} contra a meta</h3>
                <p className="sub">
                  {dataBr(l.mes.de).slice(0, 5)} a {dataBr(l.mes.fechado ? l.mes.ate : l.semana.fim).slice(0, 5)}
                  {v.metaMes ? ` · meta de ${num(v.metaMes)} vendas` : " · sem meta cadastrada"}
                  {l.mes.fechado ? " · mês fechado" : ""}
                </p>
                {(() => {
                  const max = Math.max(v.mes, v.metaMes ?? 0, v.mesAnterior);
                  return (
                    <>
                      <Barra nome="Realizado" valor={v.mes} max={max} rotulo={num(v.mes)} detalhe={v.metaMes ? `${pct(v.mes / v.metaMes)} da meta` : undefined} />
                      {v.metaMes ? (
                        <Barra nome="Meta" valor={v.metaMes} max={max} rotulo={num(v.metaMes)} tipo="miss" detalhe={v.mes >= v.metaMes ? `${num(v.mes - v.metaMes)} acima` : `faltam ${num(v.metaMes - v.mes)}`} />
                      ) : null}
                      <Barra
                        nome={l.mesAnterior.nome[0].toUpperCase() + l.mesAnterior.nome.slice(1)}
                        valor={v.mesAnterior}
                        max={max}
                        rotulo={num(v.mesAnterior)}
                        tipo="miss"
                        detalhe={l.mes.fechado ? `${num(v.mes)} é ${variacao(v.mes, v.mesAnterior)}` : "mês inteiro"}
                      />
                    </>
                  );
                })()}
                {!l.mes.fechado && v.metaMes ? (
                  <p className="small muted" style={{ marginTop: 14 }}>
                    Para bater a meta faltam {num(Math.max(0, v.metaMes - v.mes))} vendas em {plural(Math.max(0, v.diasExpedienteMes - v.diasExpedienteDecorridos), "dia", "dias")} de expediente
                    {v.diasExpedienteMes > v.diasExpedienteDecorridos
                      ? `: ${dec1(Math.max(0, v.metaMes - v.mes) / (v.diasExpedienteMes - v.diasExpedienteDecorridos))} por dia.`
                      : "."}
                  </p>
                ) : null}
              </div>
            </div>

            <h3 style={{ margin: "28px 0 10px" }}>Vendas novas por vendedor</h3>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Praça e setor</th>
                    <th className="num">Vendas na semana</th>
                    <th className="num">Ticket da semana</th>
                    <th className="num">Sem consulta na semana</th>
                    <th className="num">Vendas em {l.mes.nome}</th>
                    <th className="num">Contra a meta de {l.mes.nome}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((x) => (
                    <tr key={x.nome} className={x.vendasSemana === 0 ? "zero" : undefined}>
                      <td>{x.nome}</td>
                      <td>{[x.praca, x.setor].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="num">
                        {x.vendasSemana > 0 && <span className="mini" style={{ width: Math.max(4, (x.vendasSemana / maxVendSemana) * 60) }} />}
                        {num(x.vendasSemana)}
                      </td>
                      <td className="num">{x.ticketSemana != null ? reais2(x.ticketSemana) : "—"}</td>
                      <td className="num">{x.vendasSemana ? num(x.semConsultaSemana) : "—"}</td>
                      <td className="num">{num(x.vendasMes)}</td>
                      <td className="num">{x.metaMes ? `${pct(x.vendasMes / x.metaMes)} de ${num(x.metaMes)}` : "sem meta"}</td>
                    </tr>
                  ))}
                  {(v.semVendedorSemana > 0 || v.semVendedorMes > 0) && (
                    <tr className={v.semVendedorSemana === 0 ? "zero" : undefined}>
                      <td>Sem vendedor atribuído</td>
                      <td>—</td>
                      <td className="num">{num(v.semVendedorSemana)}</td>
                      <td className="num">—</td>
                      <td className="num">—</td>
                      <td className="num">{num(v.semVendedorMes)}</td>
                      <td className="num">—</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total das vendas novas</td>
                    <td>{reais(v.receitaSemana)} na semana</td>
                    <td className="num">{num(v.semana)}</td>
                    <td className="num">{v.ticketSemana != null ? reais2(v.ticketSemana) : "—"}</td>
                    <td className="num">{num(d.consulta.semConsultaSemana)}</td>
                    <td className="num">{num(v.mes)}</td>
                    <td className="num">{v.metaMes ? `${pct(v.mes / v.metaMes)} de ${num(v.metaMes)}` : "—"}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid2" style={{ marginTop: 20 }}>
              <div className="panel">
                <h3>Vendas por praça</h3>
                <p className="sub">{l.mes.nome[0].toUpperCase() + l.mes.nome.slice(1)}, com a semana ao lado</p>
                {v.porPraca.map((x) => (
                  <Barra key={x.nome} nome={x.nome} valor={x.mes} max={Math.max(1, ...v.porPraca.map((y) => y.mes))} rotulo={num(x.mes)} detalhe={`${num(x.semana)} na semana`} />
                ))}
              </div>
              <div className="panel">
                <h3>Mix de planos</h3>
                <p className="sub">Vendas da semana por plano, com o mês ao lado</p>
                {v.mix.slice(0, 8).map((x) => (
                  <Barra key={x.nome} nome={x.nome} valor={x.semana} max={Math.max(1, ...v.mix.map((y) => y.semana))} rotulo={num(x.semana)} detalhe={`${num(x.mes)} no mês`} />
                ))}
              </div>
            </div>

            {d.refidelizacao.length > 0 && (
              <>
                <h3 style={{ margin: "28px 0 6px" }}>Refidelização e upgrade</h3>
                <p className="muted small" style={{ marginBottom: 10 }}>
                  {lista(d.refidelizacao.map((x) => x.nome))} atuam só em refidelização e upgrade da base. Não vendem plano novo,
                  por isso não entram no ranking de vendas.
                </p>
                <div className="tscroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Atendente</th>
                        <th className="num">Renovações na semana</th>
                        <th className="num">Receita na semana</th>
                        <th className="num">Renovações em {l.mes.nome}</th>
                        <th className="num">Receita em {l.mes.nome}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.refidelizacao.map((x) => (
                        <tr key={x.nome} className={x.semana === 0 ? "zero" : undefined}>
                          <td>{x.nome}</td>
                          <td className="num">{num(x.semana)}</td>
                          <td className="num">{reais2(x.receitaSemana)}</td>
                          <td className="num">{num(x.mes)}</td>
                          <td className="num">{reais(x.receitaMes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          {/* ---------------- qualidade e esteira */}
          <section id="qualidade">
            <div className="sec-head">
              <h2>Qualidade da venda e esteira</h2>
              <p>Venda boa assina rápido, instala rápido e paga. Aqui aparece onde a venda trava. Números das vendas da semana, de {semanaTxt}.</p>
            </div>
            <div className="stats">
              <div className="stat">
                <b>{d.esteira.diasVendaAtivacao != null ? `${dec1(d.esteira.diasVendaAtivacao)} ${d.esteira.diasVendaAtivacao < 2 ? "dia" : "dias"}` : "—"}</b>
                <span>da venda à ativação ({plural(d.esteira.ativacoesSemana, "ativação", "ativações")} na semana)</span>
              </div>
              <div className="stat">
                <b>{num(d.assinatura.acima48hSemana)}</b>
                <span>sem assinatura há 48h ou mais (de {num(d.assinatura.pendentesSemana.length)} pendentes da semana)</span>
              </div>
              <div className="stat">
                <b>{num(d.esteira.aguardandoSemana)}</b>
                <span>aguardando instalação, {d.esteira.paradasMais7Dias ? `${num(d.esteira.paradasMais7Dias)} há mais de 7 dias` : "nenhum há mais de 7 dias"}</span>
              </div>
              <div className="stat">
                <b>{num(d.esteira.antigasAguardando)} + {num(d.assinatura.antigasSemAssinar)}</b>
                <span>de vendas antigas: aguardando instalação e sem assinar</span>
              </div>
            </div>
            <div className="grid2" style={{ marginTop: 20 }}>
              <div>
                <h3 style={{ marginBottom: 10 }}>Assinaturas pendentes há 48h ou mais</h3>
                <div className="tscroll">
                  <table style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Vendedor</th>
                        <th className="num">Idade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendentes48.length ? (
                        pendentes48.map((p) => (
                          <tr key={p.contrato}>
                            <td>#{p.contrato}</td>
                            <td>{p.vendedor ?? "Sem vendedor atribuído"}</td>
                            <td className="num">{plural(p.idadeDias, "dia", "dias")}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="zero">
                          <td colSpan={3}>Nenhuma venda da semana parada há 48h ou mais.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 style={{ marginBottom: 10 }}>Assinaturas pendentes por vendedor</h3>
                <div className="tscroll">
                  <table style={{ minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th>Vendedor</th>
                        <th className="num">Pendentes</th>
                        <th className="num">Há 48h ou mais</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...pendPorVend].sort((a, b2) => b2[1].total - a[1].total).map(([nome, r]) => (
                        <tr key={nome}>
                          <td>{nome}</td>
                          <td className="num">{num(r.total)}</td>
                          <td className="num">{num(r.acima)}</td>
                        </tr>
                      ))}
                      {pendPorVend.size === 0 && (
                        <tr className="zero">
                          <td colSpan={3}>Nenhuma venda da semana sem assinatura.</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>Total</td>
                        <td className="num">{num(d.assinatura.pendentesSemana.length)}</td>
                        <td className="num">{num(d.assinatura.acima48hSemana)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 12 }}>Contratos aparecem pelo número para não expor nome de cliente.</p>
          </section>

          {/* ---------------- base */}
          <section id="base">
            <div className="sec-head">
              <h2>Base de clientes e meta de {num(b.meta)} ativos</h2>
              <p>
                Hoje são {num(b.ativos)} ativos, {dec1((b.ativos / b.meta) * 100)}% da meta do ano.
                {varBase != null ? ` No relatório anterior eram ${num(b.ativosAnterior!)}: a base ${varBase >= 0 ? "subiu" : "caiu"} ${num(Math.abs(varBase))}.` : " A variação semanal aparece a partir do próximo relatório."}
              </p>
            </div>
            <dl className="calc">
              <div>
                <dt>
                  Ativos hoje
                  <small>{b.porPraca.map((p) => `${p.nome} ${num(p.ativos)}`).join(" · ")}</small>
                </dt>
                <dd>{num(b.ativos)}</dd>
              </div>
              <div>
                <dt>
                  Suspensos por débito
                  <small>saem dos ativos e voltam ao pagar{b.fechamento ? ` · ${num(b.fechamento.suspensos)} no fechamento de ${b.fechamento.mes}` : ""}</small>
                </dt>
                <dd>{num(b.suspensos)}</dd>
              </div>
              {b.fechamento && (
                <div>
                  <dt>
                    Ativos no fechamento de {b.fechamento.mes}
                    <small>a foto do mês fechado no crescimento do SGP</small>
                  </dt>
                  <dd>{num(b.fechamento.ativos)}</dd>
                </div>
              )}
              <div>
                <dt>
                  Faltam para {num(b.meta)}
                  <small>até {dataBr(b.prazo)}, ou seja, {plural(b.diasRestantes, "dia", "dias")}</small>
                </dt>
                <dd>{num(Math.max(0, b.faltam))}</dd>
              </div>
              <div>
                <dt>
                  Entradas e saídas na semana
                  <small>ativações menos cancelamentos registrados de {semanaTxt}</small>
                </dt>
                <dd>
                  {sinal(d.esteira.ativacoesSemana)} / −{num(d.esteira.cancelamentosSemana)}
                </dd>
              </div>
              {varBase != null && (
                <div>
                  <dt>
                    Variação da base desde o relatório anterior
                    <small>{num(b.ativosAnterior!)} para {num(b.ativos)}</small>
                  </dt>
                  <dd>{sinal(varBase)}</dd>
                </div>
              )}
              <div>
                <dt>
                  Ritmo líquido necessário
                  <small>estimativa: {num(Math.max(0, b.faltam))} ÷ {dec1(semanasRestantes)} semanas</small>
                </dt>
                <dd>≈ {num(Math.ceil(Math.max(0, b.faltam) / semanasRestantes))} por semana</dd>
              </div>
              {v.metaMes ? (
                <div>
                  <dt>
                    Total até {dataBr(b.prazo).slice(0, 5)} mantendo a meta de {l.mes.nome}
                    <small>estimativa: {num(v.metaMes)} por mês, {plural(mesesRestantes, "mês", "meses")}, {pct((v.metaMes * mesesRestantes) / Math.max(1, b.faltam))} do que falta, antes de cancelamentos</small>
                  </dt>
                  <dd>≈ {num(v.metaMes * mesesRestantes)}</dd>
                </div>
              ) : null}
              <div className="res">
                <dt>
                  Vendas por mês até {dataBr(b.prazo).slice(0, 5)} para fechar
                  <small>estimativa: {num(Math.max(0, b.faltam))} ÷ {plural(mesesRestantes, "mês", "meses")}, antes de contar cancelamentos</small>
                </dt>
                <dd>≈ {num(Math.ceil(Math.max(0, b.faltam) / mesesRestantes))}</dd>
              </div>
            </dl>
            <p className="small muted" style={{ marginTop: 12 }}>
              Conta feita com vendas brutas: cada cancelamento aumenta o que falta. Valores com ≈ são estimativas a partir dos
              números da plataforma.
            </p>
          </section>

          {/* ---------------- retenção */}
          <section id="retencao">
            <div className="sec-head">
              <h2>Retenção: fila de débito</h2>
              <p>Clientes com boleto vencido há mais de 15 dias, como na tela Prevenção de cancelamento.</p>
            </div>
            <div className="stats">
              <div className="stat">
                <b>{num(f.clientes)}</b>
                <span>clientes na fila{f.anterior ? ` (${num(f.anterior.clientes)} no relatório anterior)` : ""}</span>
              </div>
              <div className="stat">
                <b>{reais(f.emRisco)}</b>
                <span>de mensalidade em risco por mês{f.anterior ? ` (${reais(f.anterior.emRisco)} antes)` : ""}</span>
              </div>
              <div className="stat">
                <b>{reais(f.emAberto)}</b>
                <span>em aberto, {plural(f.boletos, "boleto vencido", "boletos vencidos")}</span>
              </div>
              <div className="stat">
                <b>{num(f.contatados7d)}</b>
                <span>contatados nos últimos 7 dias ({pct(f.clientes ? f.contatados7d / f.clientes : 0)} da fila)</span>
              </div>
            </div>
            <div className="grid2" style={{ marginTop: 20 }}>
              <div className="panel">
                <h3>Mensalidade em risco por tempo de atraso</h3>
                <p className="sub">R$ por mês e clientes em cada faixa</p>
                {f.faixas.map((x) => {
                  const antes = f.anterior?.faixas.find((y) => y.faixa === x.faixa);
                  return (
                    <Barra
                      key={x.faixa}
                      nome={x.faixa}
                      valor={x.valor}
                      max={maxFaixa}
                      rotulo={reais(x.valor)}
                      detalhe={`${plural(x.clientes, "cliente", "clientes")}${antes ? ` (${num(antes.clientes)} antes)` : ""}`}
                    />
                  );
                })}
              </div>
              <div className="panel">
                <h3>O que isso significa em números</h3>
                <p className="sub">Comparação com a venda nova</p>
                <dl className="calc">
                  <div>
                    <dt>Mensalidade em risco na fila</dt>
                    <dd>{reaisMil(f.emRisco)}/mês</dd>
                  </div>
                  <div>
                    <dt>Receita nova contratada em {l.mes.nome}{l.mes.fechado ? "" : ` até ${diaMes(l.semana.fim)}`}</dt>
                    <dd>{reaisMil(v.receitaMes)}/mês</dd>
                  </div>
                  <div>
                    <dt>
                      Fila em meses de venda nova
                      <small>quanto da venda nova de {l.mes.nome} a fila apaga se cancelar</small>
                    </dt>
                    <dd>{v.receitaMes ? `${dec1(f.emRisco / v.receitaMes)}×` : "—"}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          {/* ---------------- insights */}
          <section id="insights">
            <div className="sec-head">
              <h2>Insights da semana</h2>
              <p>Três leituras dos mesmos números: a neutra, a do advogado do diabo e a estratégica.</p>
            </div>
            {t ? (
              <div className="tri">
                {(
                  [
                    ["t-neutral", "Visão neutra", t.insights.neutra],
                    ["t-bad", "Advogado do diabo", t.insights.advogado],
                    ["t-good", "Visão estratégica", t.insights.estrategica],
                  ] as const
                ).map(([classe, titulo, itens]) => (
                  <div key={classe} className={classe}>
                    <h3>{titulo}</h3>
                    <ul>
                      {itens.map((i, k) => (
                        <li key={k}>
                          {i.destaque && <b>{i.destaque} </b>}
                          {i.texto}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Os insights são escritos junto com o relatório. Gere os textos de novo na tela de relatórios.</p>
            )}

            {d.conferir.length > 0 && (
              <>
                <h3 style={{ margin: "28px 0 10px" }}>Para conferir no sistema antes da reunião</h3>
                <ul className="checks">
                  {d.conferir.map((c, k) => (
                    <li key={k}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            <h3 style={{ margin: "28px 0 10px" }}>Indicadores que a plataforma ainda não entrega</h3>
            <ul className="checks">
              {NAO_ENTREGA.map((c, k) => (
                <li key={k}>{c}</li>
              ))}
            </ul>
          </section>

          {/* ---------------- quem cobrar */}
          {t && (
            <section id="cobranca">
              <div className="sec-head">
                <h2>Quem cobrar: base líquida, esteira e retenção</h2>
                <p>Esses três itens não são só do comercial. O diretor comercial leva o problema, mas cada um tem alguém que entrega.</p>
              </div>
              {(
                [
                  ["base", "Crescimento líquido da base", t.cobranca.base],
                  ["esteira", "Esteira de ativação", t.cobranca.esteira],
                  ["retencao", "Retenção (fila de débito)", t.cobranca.retencao],
                ] as const
              ).map(([chave, titulo, c]) => (
                <div key={chave} className="owner">
                  <div className="owner-top">
                    <h3>{titulo}</h3>
                    {impressao ? (
                      reuniao[`r-${chave}`] ? (
                        <div className="who">
                          <span className="small muted">Responsável</span>
                          <b>{reuniao[`r-${chave}`]}</b>
                        </div>
                      ) : null
                    ) : (
                      <div className="who">
                        <label htmlFor={`r-${chave}`}>Responsável</label>
                        <CampoReuniao id={id} campo={`r-${chave}`} inicial={reuniao[`r-${chave}`] ?? ""} placeholder="Nome do responsável" podeEditar={podeEditar} />
                      </div>
                    )}
                  </div>
                  <dl>
                    <dt>Cobrar de</dt>
                    <dd>{c.cobrarDe}</dd>
                    <dt>O que cobrar</dt>
                    <dd>
                      <ul>
                        {c.oQueCobrar.map((x, k) => (
                          <li key={k}>{x}</li>
                        ))}
                      </ul>
                    </dd>
                    <dt>Pergunta-chave</dt>
                    <dd>“{c.perguntaChave.replace(/^["“]|["”]$/g, "")}”</dd>
                    <dt>Cadência</dt>
                    <dd>{c.cadencia}</dd>
                    <dt>Sinal de que melhorou</dt>
                    <dd>{c.sinalDeMelhora}</dd>
                  </dl>
                </div>
              ))}
            </section>
          )}

          {/* ---------------- reunião */}
          <section id="perguntas">
            <div className="sec-head">
              <h2>Perguntas para a reunião de segunda</h2>
              <p>
                {impressao
                  ? "Perguntas para levar à reunião. As respostas e o checklist do Paulo se preenchem no relatório da plataforma."
                  : podeEditar
                    ? "Escreva as respostas direto nos campos. O que você digitar fica salvo no relatório."
                    : "Respostas registradas na reunião."}
              </p>
            </div>
            {impressao ? (
              <PerguntasPdf
                reuniao={reuniao}
                combinadoAnterior={combinadoAnterior}
                perguntas={t?.perguntasSemana ?? []}
                sugestoes={t?.sugestoesChecklist ?? []}
              />
            ) : (
              <PerguntasReuniao
                id={id}
                semana={semanaTxt}
                reuniao={reuniao}
                combinadoAnterior={combinadoAnterior}
                perguntas={t?.perguntasSemana ?? []}
                sugestoes={t?.sugestoesChecklist ?? []}
                podeEditar={podeEditar}
              />
            )}
          </section>

          <div className="foot">
            <span>
              Fonte: plataforma Interlig · Inteligência Comercial (dados do SGP), com a mesma conta das telas Dashboard,
              Vendedoras, Esteira, Prevenção de cancelamento e Refidelização. Lido em {lidoEm}. Vendas novas sem rede neutra.
            </span>
            <span>
              Status: mês fechado fica ok com 100% da meta e em atenção a partir de {pct(LIMITES.mesAtencao)}; semana e mês
              aberto, no ritmo da meta (atenção a partir de {pct(LIMITES.ritmoAtencao)} dele); consulta de crédito ok até{" "}
              {pct(LIMITES.consultaOk)} sem consulta; origem ok a partir de {pct(LIMITES.origemOk)} preenchida; fila ok com{" "}
              {pct(LIMITES.filaOk)} contatada em 7 dias.
            </span>
            <span>Valores marcados com ≈ ou “estimativa” são contas feitas a partir dos números da plataforma. Textos escritos pelo Claude a partir desses números.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
