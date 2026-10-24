import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, MonitorPlay } from "lucide-react";
import { BotaoDesativarMeta, BotaoRemoverIndisponibilidade, FormAdmissao, FormIndisponibilidade, FormMeta } from "@/components/performance/acoes-metas";
import { FiltrosPerformance } from "@/components/performance/filtros";
import { fmtBrl, fmtData, fmtNum, fmtNum1, fmtPct } from "@/components/performance/formato";
import { Kpi } from "@/components/performance/kpi";
import { BarraProgresso, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { apurarPerformance } from "@/lib/performance/dados/apurar";
import { apurarMetas, type MetaExtra } from "@/lib/performance/dados/metas";
import { contextoPagina, type SearchParams } from "@/lib/performance/pagina";
import { ROTULO_PERIODICIDADE, ROTULO_SITUACAO_META, TIPOS_META, type SituacaoMeta } from "@/lib/performance/regras/metas";
import { RELATORIOS } from "@/lib/performance/relatorios";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeMes = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
const mesCurto = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}/${iso.slice(2, 4)}`;
const ROTULO_AFASTAMENTO: Record<string, string> = { ferias: "Férias", folga: "Folga", afastamento: "Afastamento", treinamento: "Treinamento", outro: "Outro" };

function ChipSituacao({ s }: { s: SituacaoMeta }) {
  const tom =
    s === "atingida" || s === "no_ritmo"
      ? "border-farol-verde/40 bg-farol-verde/10 text-[hsl(152_60%_26%)]"
      : s === "abaixo_do_ritmo" || s === "abaixo"
        ? "border-farol-amarelo/50 bg-farol-amarelo/10 text-[hsl(38_92%_28%)]"
        : s === "nao_atingida"
          ? "border-farol-vermelho/40 bg-farol-vermelho/10 text-farol-vermelho"
          : "border-border bg-muted/50 text-muted-foreground";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tom)}>{ROTULO_SITUACAO_META[s]}</span>;
}

/** valor de meta extra na unidade do tipo (conversão: fração no realizado, % digitado na meta) */
function fmtExtra(m: MetaExtra, valor: number | null, ehMeta = false) {
  if (valor === null) return "—";
  switch (TIPOS_META[m.tipo].unidade) {
    case "pct":
      return ehMeta ? `${fmtNum1(valor)}%` : fmtPct(valor, 1);
    case "min":
      return `${fmtNum1(valor)} min`;
    case "brl":
      return fmtBrl(valor);
    case "pontos":
      return fmtNum1(valor);
    default:
      return fmtNum1(valor);
  }
}

export default async function RelatoriosMetasPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await contextoPagina(searchParams);
  if (ctx.escopo.papel === "vendedor") redirect("/performance/vendedor/eu");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const ap = await apurarPerformance(ctx.escopo, ctx.periodo, ctx.filtros);
  const metas = await apurarMetas(ap, hoje);
  const idsEscopo = new Set(ap.base.vendedores.map((v) => v.id));
  const { data: afastBrutos } = await criarClienteAdmin()
    .from("indisponibilidades_vendedor")
    .select("id, vendedor_id, inicio, fim, tipo, observacao, criado_em")
    .gte("fim", new Date(Date.parse(`${hoje}T12:00:00Z`) - 60 * 86_400_000).toISOString().slice(0, 10))
    .order("inicio", { ascending: false })
    .limit(300);
  const nomeV = new Map(ap.base.vendedores.map((v) => [v.id, v.nome]));
  const afastamentos = (afastBrutos ?? []).filter((a) => idsEscopo.has(a.vendedor_id as string));
  const podeMetas = ctx.escopo.podeGerirMetas;
  const podeAfastar = ["admin", "supervisor", "gerente_unidade"].includes(ctx.escopo.papel);
  const rampa = ap.base.cfg.rampa_dias;
  const emRampa = ap.base.vendedores
    .filter((v) => v.ativo && v.admitido_em && Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${v.admitido_em}T12:00:00Z`) < rampa * 86_400_000)
    .map((v) => ({ nome: v.nome, ate: new Date(Date.parse(`${v.admitido_em}T12:00:00Z`) + rampa * 86_400_000).toISOString().slice(0, 10) }));

  // exportação: mesmos filtros da tela (o servidor reaplica o escopo)
  const filtrosQs = new URLSearchParams();
  for (const k of ["periodo", "de", "ate", "pop", "setor", "coord", "vendedor"]) {
    const v = searchParams[k];
    if (typeof v === "string" && v) filtrosQs.set(k, v);
  }
  const link = (relatorio: string, formato: "xlsx" | "csv") => `/api/performance/exportar?${new URLSearchParams({ relatorio, formato }).toString()}${filtrosQs.toString() ? `&${filtrosQs.toString()}` : ""}`;
  const refFmt = fmtData(metas.referencia);
  const detalheJanela: Record<string, string> = {
    performance_diaria: `dia ${refFmt}`,
    performance_semanal: `7 dias até ${refFmt}`,
    performance_mensal: `${nomeMes(metas.referencia)} até ${refFmt}`,
  };
  const t = metas.total;

  return (
    <div>
      <FiltrosPerformance de={ctx.periodo.de} ate={ctx.periodo.ate} rotulo={ctx.periodo.rotulo} pops={ctx.opcoes.pops} setores={ctx.opcoes.setores} coordenadores={ctx.opcoes.coordenadores} />
      <p className="mb-3 text-xs text-muted-foreground">
        Metas apuradas em <b className="font-medium text-foreground">{nomeMes(metas.referencia)}</b>, até {refFmt}
        {metas.mes.emAndamento ? " (dia em andamento)" : ""} · {metas.mes.diasUteis} dias úteis no mês, {metas.mes.diasRestantes} restante(s). Projeções são estimativas.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Meta de vendas do mês" valor={t ? fmtNum(t.meta) : "—"} contexto={t ? `${t.membros} vendedor(es) com meta` : "sem metas no mês"} />
        <Kpi rotulo="Realizado" valor={t ? fmtNum(t.realizado) : "—"} contexto="vendas pela data da venda" />
        <Kpi rotulo="Cumprimento" valor={t?.pct === null || !t ? "—" : fmtPct(t.pct)} tom={t?.situacao === "atingida" || t?.situacao === "no_ritmo" ? "verde" : t?.situacao === "abaixo_do_ritmo" ? "amarelo" : undefined} contexto={t ? ROTULO_SITUACAO_META[t.situacao].toLowerCase() : undefined} />
        <Kpi rotulo="Projeção de fechamento (estimativa)" valor={t?.projecao === null || !t ? "—" : fmtNum(t.projecao)} contexto="ritmo dos dias úteis encerrados" />
        <Kpi rotulo="Dias úteis restantes" valor={fmtNum(metas.mes.diasRestantes)} contexto={metas.mes.emAndamento ? "contando hoje" : "depois da data de referência"} />
      </div>

      <Painel
        className="mt-4"
        titulo={`Meta mensal de vendas — ${nomeMes(metas.referencia)}`}
        descricao="Meta da tela Metas e comissão (a mesma do dashboard e da comissão). Projeção = vendas até agora + ritmo dos dias úteis já encerrados × dias úteis disponíveis que faltam (afastamentos registrados saem da conta). É estimativa, não compromisso."
        acao={podeMetas ? <Link href="/metas" className="text-xs font-medium text-interlig-azul hover:underline">Editar metas do mês</Link> : undefined}
      >
        {metas.mensal.length === 0 ? (
          <Vazio>Nenhum vendedor deste filtro tem meta de vendas cadastrada em {nomeMes(metas.referencia)}.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Vendedor</th>
                  <th className="py-2 font-medium">Unidade</th>
                  <th className="py-2 text-right font-medium">Meta</th>
                  <th className="py-2 text-right font-medium">Realizado</th>
                  <th className="w-36 py-2 pl-4 font-medium">Cumprimento</th>
                  <th className="py-2 text-right font-medium">Projeção*</th>
                  <th className="py-2 text-right font-medium">Dias úteis rest.</th>
                  <th className="py-2 text-right font-medium">Precisa/dia</th>
                  <th className="py-2 pl-4 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {metas.mensal.map((l) => (
                  <tr key={l.vendedor.id} className="border-t">
                    <td className="py-2.5">
                      <Link href={`/performance/vendedor/${l.vendedor.id}?${filtrosQs.toString()}`} className="font-medium hover:underline">
                        {l.vendedor.nome}
                      </Link>
                      {l.afastadoNoMes > 0 && <span className="block text-[11px] text-muted-foreground">{l.afastadoNoMes} dia(s) útil(eis) de afastamento no mês</span>}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{l.vendedor.pop_nome ?? "—"}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtNum(l.meta)}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{fmtNum(l.realizado)}</td>
                    <td className="py-2.5 pl-4">
                      <div className="flex items-center gap-2">
                        <BarraProgresso fracao={l.pct} />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums">{fmtPct(l.pct)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{l.projecao === null ? "—" : fmtNum1(l.projecao)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtNum(l.diasRestantes)}</td>
                    <td className="py-2.5 text-right tabular-nums">{l.necessarioPorDia === null ? "—" : fmtNum1(l.necessarioPorDia)}</td>
                    <td className="py-2.5 pl-4">
                      <ChipSituacao s={l.situacao} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">* Estimativa linear. Com menos de 3 dias úteis encerrados no mês, não há projeção.</p>
        {metas.semMeta.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sem meta em {nomeMes(metas.referencia)} (ficam fora do total e da comparação do ranking): {metas.semMeta.map((v) => v.nome).join(", ")}.
          </p>
        )}
      </Painel>

      {(metas.equipes.length > 0 || metas.unidades.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            ["Por equipe", "Só entra no total da equipe quem tem meta no mês (mesma regra do dashboard da coordenação).", metas.equipes],
            ["Por unidade", "Soma das metas individuais e das vendas de quem tem meta no mês (a meta do coordenador é a do time e não soma de novo).", metas.unidades],
          ].map(([titulo, desc, grupos]) => (
            <Painel key={titulo as string} titulo={titulo as string} descricao={desc as string}>
              <ul className="space-y-2.5">
                {(grupos as typeof metas.equipes).map((g) => (
                  <li key={g.nome} className="text-sm">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{g.nome}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fmtNum(g.realizado)} de {fmtNum(g.meta)} · {fmtPct(g.pct)} · projeção {g.projecao === null ? "—" : fmtNum(g.projecao)}
                      </span>
                    </div>
                    <BarraProgresso fracao={g.pct} />
                  </li>
                ))}
              </ul>
            </Painel>
          ))}
        </div>
      )}

      <Painel
        className="mt-4"
        titulo="Metas adicionais"
        descricao="Ativação, conversão, follow-ups, tempo de resposta, receita, ticket médio, qualidade, esforço e IPC — por vendedor, função, equipe, unidade ou todos; diárias, semanais ou mensais. Apuradas no ciclo que contém a data de referência."
      >
        {metas.extras.length === 0 ? (
          <Vazio>Nenhuma meta adicional vigente{podeMetas ? " — cadastre abaixo." : "."}</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Meta</th>
                  <th className="py-2 font-medium">Aplica-se a</th>
                  <th className="py-2 font-medium">Ciclo apurado</th>
                  <th className="py-2 text-right font-medium">Meta</th>
                  <th className="py-2 text-right font-medium">Realizado</th>
                  <th className="w-32 py-2 pl-4 font-medium">Cumprimento</th>
                  <th className="py-2 text-right font-medium">Projeção*</th>
                  <th className="py-2 pl-4 font-medium">Situação</th>
                  {podeMetas && <th className="py-2" />}
                </tr>
              </thead>
              <tbody>
                {metas.extras.map((m) => (
                  <tr key={m.id} className="border-t align-top">
                    <td className="py-2.5">
                      <span className="font-medium">{TIPOS_META[m.tipo].rotulo}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {ROTULO_PERIODICIDADE[m.periodicidade]} · vigência {fmtData(m.inicio)} a {fmtData(m.fim)}
                      </span>
                    </td>
                    <td className="py-2.5">
                      {m.aplicaA}
                      {m.parcial && <span className="block text-[11px] text-muted-foreground">parcial: só {m.membros} do filtro atual</span>}
                    </td>
                    <td className="py-2.5 text-xs tabular-nums text-muted-foreground">
                      {m.janela.de === m.janela.ate ? fmtData(m.janela.de) : `${fmtData(m.janela.de)} a ${fmtData(m.janela.ate)}`}
                      {m.janela.situacao === "encerrada" && <span className="block">vigência encerrada</span>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{fmtExtra(m, m.valor, true)}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{fmtExtra(m, m.realizado)}</td>
                    <td className="py-2.5 pl-4">
                      <div className="flex items-center gap-2">
                        <BarraProgresso fracao={m.pct} />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums">{fmtPct(m.pct)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">{TIPOS_META[m.tipo].aditiva && m.projecao !== null ? fmtExtra(m, m.projecao) : "—"}</td>
                    <td className="py-2.5 pl-4">
                      <ChipSituacao s={m.situacao} />
                    </td>
                    {podeMetas && (
                      <td className="py-2.5 text-right">
                        <BotaoDesativarMeta id={m.id} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {metas.extras.length > 0 && <p className="mt-2 text-xs text-muted-foreground">* Projeção só para metas de soma (vendas, ativações, leads, follow-ups, receita) semanais ou mensais. Taxas e notas comparam o valor atual com a meta.</p>}
        {podeMetas && (
          <details className="mt-3 rounded-lg border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-medium text-interlig-azul">Cadastrar meta adicional</summary>
            <div className="mt-3">
              <FormMeta opcoes={ctx.opcoes} hoje={hoje} />
            </div>
          </details>
        )}
      </Painel>

      <Painel className="mt-4" titulo="Histórico de metas de vendas" descricao="Vendas contáveis ÷ meta mensal individual dos meses anteriores (até seis; só meses com meta cadastrada).">
        {metas.historico.linhas.length === 0 ? (
          <Vazio>Sem metas cadastradas nos meses anteriores para este filtro.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Vendedor</th>
                  {metas.historico.meses.map((m) => (
                    <th key={m} className="py-2 text-right font-medium">
                      {mesCurto(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metas.historico.linhas.map((l) => (
                  <tr key={l.vendedor} className="border-t">
                    <td className="py-2 font-medium">{l.vendedor}</td>
                    {l.porMes.map((c, i) => {
                      const pct = c ? c.realizado / c.meta : null;
                      return (
                        <td key={metas.historico.meses[i]} className="py-2 text-right tabular-nums">
                          {c ? (
                            <span title={`${c.realizado} de ${c.meta}`}>
                              <span className={cn("font-medium", pct !== null && pct >= 1 ? "text-[hsl(152_60%_26%)]" : pct !== null && pct < 0.7 ? "text-farol-vermelho" : "")}>{fmtPct(pct)}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {fmtNum(c.realizado)}/{fmtNum(c.meta)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Painel titulo="Afastamentos, folgas e treinamentos" descricao="Dias registrados aqui saem da meta proporcional, da projeção e da disponibilidade usada no ranking.">
          {afastamentos.length === 0 ? (
            <Vazio>Nenhum registro nos últimos 60 dias nem programado.</Vazio>
          ) : (
            <ul className="divide-y text-sm">
              {afastamentos.map((a) => (
                <li key={a.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{nomeV.get(a.vendedor_id as string) ?? "Vendedor"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROTULO_AFASTAMENTO[a.tipo as string] ?? (a.tipo as string)} · {fmtData(a.inicio as string)} a {fmtData(a.fim as string)}
                      {a.observacao ? ` · ${a.observacao as string}` : ""}
                    </span>
                  </span>
                  {podeAfastar && <BotaoRemoverIndisponibilidade id={a.id as string} />}
                </li>
              ))}
            </ul>
          )}
          {podeAfastar && (
            <details className="mt-3 rounded-lg border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium text-interlig-azul">Registrar afastamento</summary>
              <div className="mt-3">
                <FormIndisponibilidade vendedores={ctx.opcoes.vendedores} hoje={hoje} />
              </div>
            </details>
          )}
        </Painel>

        <Painel titulo="Recém-contratados (rampa)" descricao={`Nos primeiros ${rampa} dias após a admissão o vendedor aparece nos indicadores, mas fica fora da posição no ranking.`}>
          {emRampa.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum vendedor em rampa agora.</p>
          ) : (
            <ul className="mb-3 space-y-1 text-sm">
              {emRampa.map((v) => (
                <li key={v.nome}>
                  <span className="font-medium">{v.nome}</span> <span className="text-xs text-muted-foreground">— em rampa até {fmtData(v.ate)}</span>
                </li>
              ))}
            </ul>
          )}
          {podeMetas && (
            <div className="mt-3">
              <FormAdmissao vendedores={ap.base.vendedores.filter((v) => v.ativo && ap.base.cfg.setores.includes(v.setor ?? "")).map((v) => ({ id: v.id, nome: v.nome, admitido_em: v.admitido_em })).sort((a, b) => a.nome.localeCompare(b.nome))} />
            </div>
          )}
        </Painel>
      </div>

      <Painel
        className="mt-4"
        titulo="Relatórios gerenciais"
        descricao="Mesmos filtros e definições desta tela; o servidor reaplica o seu escopo. Cada exportação fica registrada na trilha de auditoria. Documentos internos (LGPD)."
        acao={
          <Link href="/tv/performance" target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-interlig-azul hover:bg-muted">
            <MonitorPlay className="h-3.5 w-3.5" aria-hidden />
            Abrir versão para TV
          </Link>
        }
      >
        {!ctx.escopo.podeExportar ? (
          <Vazio>Seu perfil não exporta relatórios.</Vazio>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {Object.entries(RELATORIOS).map(([k, rotulo]) => (
              <li key={k} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
                <span className="min-w-0">
                  {rotulo}
                  <span className="block text-[11px] text-muted-foreground">{detalheJanela[k] ?? ctx.periodo.rotulo}</span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {(["xlsx", "csv"] as const).map((f) => (
                    <a key={f} href={link(k, f)} className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted" aria-label={`Baixar ${rotulo} em ${f.toUpperCase()}`}>
                      <Download className="h-3 w-3" aria-hidden />
                      {f.toUpperCase()}
                    </a>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}
