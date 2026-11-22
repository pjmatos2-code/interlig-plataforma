"use client";

import { cn } from "@/lib/utils";
import { MINIMO_FAROL_TECNICO, type CartaoTecnico, type LinhaAgendaTecnico, type RecorteTecnico, type TurmaInstalacao } from "@/lib/grr/tecnico/regras";
import { Moldura, useSecao } from "./moldura";
import { Numero, TV, Titulo } from "./pecas";

/**
 * Modo Apresentação da reunião operacional do setor técnico (terças, decisão
 * de 21/11/2026). Mesma moldura e mesmos tamanhos de TV das reuniões do
 * comercial; números do GRR Técnico (foto congelada quando existe). Só leitura.
 */

const SECOES = [
  { chave: "instalacoes", titulo: "Instalações da semana" },
  { chave: "turmas", titulo: "Turmas de instalação" },
  { chave: "prazos", titulo: "Prazos de atendimento" },
  { chave: "agenda", titulo: "Agenda por técnico" },
  { chave: "processo", titulo: "Qualidade e processo" },
  { chave: "unidades", titulo: "Por unidade" },
] as const;

const FAIXA = { ok: "border-t-farol-verde", atencao: "border-t-farol-amarelo", critico: "border-t-farol-vermelho", sem_meta: "border-t-interlig-azul" } as const;
const SELO = { ok: "bg-farol-verde/15 text-farol-verde", atencao: "bg-farol-amarelo/25 text-yellow-800", critico: "bg-farol-vermelho/15 text-farol-vermelho", sem_meta: "bg-slate-100 text-slate-600" } as const;
const ROTULO = { ok: "No ritmo", atencao: "Atenção", critico: "Crítico", sem_meta: "Sem meta" } as const;
const COR = { ok: "text-farol-verde", atencao: "text-yellow-700", critico: "text-farol-vermelho", sem_meta: "text-slate-900" } as const;

function Indicador({ c }: { c: CartaoTecnico | undefined }) {
  if (!c) return null;
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-[1.2vh] border-t-[6px]", TV.quadro, FAIXA[c.status])}>
      <div className="flex items-start justify-between gap-4">
        <p className={cn("min-w-0 font-semibold text-slate-700", TV.rotulo)}>{c.rotulo}</p>
        <span className={cn("shrink-0 rounded-full px-3 py-1 font-semibold", TV.detalhe, SELO[c.status])}>{ROTULO[c.status]}</span>
      </div>
      <p className="flex flex-wrap items-baseline gap-x-3 tabular-nums">
        <span className={cn("whitespace-nowrap font-extrabold leading-none tracking-tight", COR[c.status], c.valor.length > 6 ? TV.valorMedio : TV.valor)}>{c.valor}</span>
        {c.meta && <span className={cn("font-semibold text-slate-500", TV.rotulo)}>{c.meta}</span>}
      </p>
      <div className={cn("text-slate-600", TV.detalhe)}>
        {c.evolucao && (
          <p className={cn("font-medium", c.evolucao.bom === true && "text-farol-verde", c.evolucao.bom === false && "text-farol-vermelho")}>
            {c.evolucao.direcao === "sobe" ? "▲" : c.evolucao.direcao === "desce" ? "▼" : "•"} {c.evolucao.texto}
          </p>
        )}
        {c.contexto && <p className="mt-0.5">{c.contexto}</p>}
      </div>
    </div>
  );
}

export function ApresentacaoTecnico(p: {
  rotuloSemana: string;
  status: string;
  hrefVoltar: string;
  porRecorte: { recorte: RecorteTecnico; cartoes: CartaoTecnico[]; porTecnico?: LinhaAgendaTecnico[]; turmas?: TurmaInstalacao[] }[];
}) {
  const { atual, ir } = useSecao(SECOES);
  const empresa = p.porRecorte[0]?.cartoes ?? [];
  const k = (chave: string, cartoes = empresa) => cartoes.find((c) => c.chave === chave);
  const unidades = p.porRecorte.slice(1);
  const agenda = p.porRecorte[0]?.porTecnico ?? [];
  const turmas = [...(p.porRecorte[0]?.turmas ?? [])].reverse();
  const semanaAtual = turmas[0]?.inicio;
  const linhas = ["tec_instalacoes", "tec_instalacoes_vs_os", "tec_deixados_para_tras", "tec_instalacao_48h", "tec_agenda_no_dia", "tec_suporte_24h", "tec_corporativo_4h", "tec_mudanca_24h", "tec_retorno_7d", "tec_agendamentos_vencidos", "tec_falta_validar", "tec_os_para_baixar"];

  const telas = [
    <div key="i" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub={`Semana ${p.rotuloSemana} · ${p.status}`}>Instalações da semana</Titulo>
      <div className="grid flex-1 gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-5">
        <div className="grid lg:col-span-2">
          <Indicador c={k("tec_instalacoes")} />
        </div>
        {unidades.map((u) => {
          const c = k("tec_instalacoes", u.cartoes);
          return <Numero key={u.recorte.rotulo} rotulo={u.recorte.rotulo} valor={c?.valor ?? "—"} detalhe={c?.meta ?? undefined} />;
        })}
      </div>
      <div className="grid gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-3">
        <Indicador c={k("tec_instalacoes_vs_os")} />
        <Indicador c={k("tec_deixados_para_tras")} />
        <Indicador c={k("tec_instalacao_48h")} />
      </div>
    </div>,
    <div key="t" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub="OS de instalação criadas em cada semana e quantas ainda não viraram contrato ativo">Turmas de instalação</Titulo>
      <div className="grid gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Indicador c={k("tec_deixados_para_tras")} />
        <div className={cn("overflow-x-auto border-t-[6px] border-t-interlig-azul", TV.quadro)}>
          {turmas.length === 0 ? (
            <p className={cn("text-slate-600", TV.corpo)}>Esta semana foi congelada antes desta tabela existir.</p>
          ) : (
            <table className={cn("w-full tabular-nums", TV.corpo)}>
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-[0.5vh] pr-4 font-semibold">Semana da OS</th>
                  <th className="py-[0.5vh] pl-4 text-right font-semibold">Criadas</th>
                  <th className="py-[0.5vh] pl-4 text-right font-semibold">Ativadas</th>
                  <th className="py-[0.5vh] pl-4 text-right font-semibold">Deixados</th>
                </tr>
              </thead>
              <tbody>
                {turmas.map((tu) => (
                  <tr key={tu.inicio} className="border-t-2 border-slate-200">
                    <td className="py-[0.55vh] pr-4 font-medium text-slate-700">{tu.inicio.slice(8, 10)}/{tu.inicio.slice(5, 7)}{tu.inicio === semanaAtual ? " (esta)" : ""}</td>
                    <td className="py-[0.55vh] pl-4 text-right">{tu.criadas}</td>
                    <td className="py-[0.55vh] pl-4 text-right">{tu.ativadas}</td>
                    <td className={cn("py-[0.55vh] pl-4 text-right font-bold", tu.pendentes > 0 && tu.inicio !== semanaAtual ? "text-farol-vermelho" : "text-slate-500")}>{tu.pendentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    <div key="p" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub="Quanto do serviço foi feito dentro do prazo combinado">Prazos de atendimento</Titulo>
      <div className="grid flex-1 auto-rows-fr gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-2">
        <Indicador c={k("tec_instalacao_48h")} />
        <Indicador c={k("tec_suporte_24h")} />
        <Indicador c={k("tec_corporativo_4h")} />
        <Indicador c={k("tec_mudanca_24h")} />
      </div>
    </div>,
    <div key="a" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub={`OS agendadas e vencidas na semana · atrasada: chegou depois do dia, ficou pendente ou não houve check-in · menos de ${MINIMO_FAROL_TECNICO} OS fica sem farol`}>Agenda por técnico</Titulo>
      <div className="grid gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Indicador c={k("tec_agenda_no_dia")} />
        <div className={cn("overflow-x-auto border-t-[6px] border-t-interlig-azul", TV.quadro)}>
          {agenda.length === 0 ? (
            <p className={cn("text-slate-600", TV.corpo)}>Sem OS agendadas vencidas nesta semana{p.status.includes("fechamento") ? " (ou semana congelada antes deste quadro existir)" : ""}.</p>
          ) : (
            <table className={cn("w-full tabular-nums", TV.corpo)}>
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-[0.6vh] pr-4 font-semibold">Técnico</th>
                  <th className="py-[0.6vh] pl-4 text-right font-semibold">Agendadas</th>
                  <th className="py-[0.6vh] pl-4 text-right font-semibold">No dia</th>
                  <th className="py-[0.6vh] pl-4 text-right font-semibold">Atrasadas</th>
                  <th className="py-[0.6vh] pl-4 text-right font-semibold">%</th>
                </tr>
              </thead>
              <tbody>
                {agenda.slice(0, 12).map((l) => (
                  <tr key={l.tecnico} className="border-t-2 border-slate-200">
                    <td className="py-[0.7vh] pr-4 font-medium text-slate-700">{l.tecnico}</td>
                    <td className="py-[0.7vh] pl-4 text-right">{l.agendadas}</td>
                    <td className="py-[0.7vh] pl-4 text-right">{l.cumpridas}</td>
                    <td className={cn("py-[0.7vh] pl-4 text-right font-bold", l.atrasadas > 0 ? "text-farol-vermelho" : "text-slate-500")}>{l.atrasadas}</td>
                    <td className={cn("py-[0.7vh] pl-4 text-right font-bold", COR[l.status])}>{l.taxa == null ? "—" : `${Math.round(l.taxa * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    <div key="q" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub="Serviço que volta e o que trava a operação fora do campo">Qualidade e processo</Titulo>
      <div className="grid flex-1 auto-rows-fr gap-[clamp(0.7rem,1.2vw,1.75rem)] lg:grid-cols-2">
        <Indicador c={k("tec_retorno_7d")} />
        <Indicador c={k("tec_agendamentos_vencidos")} />
        <Indicador c={k("tec_falta_validar")} />
        <Indicador c={k("tec_os_para_baixar")} />
      </div>
    </div>,
    <div key="u" className="flex flex-col gap-[clamp(0.7rem,1.4vh,1.75rem)]">
      <Titulo sub="Verde bate a meta, amarelo pede atenção, vermelho está fora">Por unidade</Titulo>
      <div className={cn("flex-1 overflow-x-auto", TV.quadro, "border-t-[6px] border-t-interlig-azul")}>
        <table className={cn("w-full tabular-nums", TV.corpo)}>
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-[0.8vh] pr-4 font-semibold">Indicador</th>
              {p.porRecorte.map((x) => (
                <th key={x.recorte.rotulo} className="py-[0.8vh] pl-4 text-right font-semibold">{x.recorte.rotulo}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((chave) => (
              <tr key={chave} className="border-t-2 border-slate-200">
                <td className="py-[0.9vh] pr-4 font-medium text-slate-700">{k(chave)?.rotulo ?? chave}</td>
                {p.porRecorte.map((x) => {
                  const c = k(chave, x.cartoes);
                  return (
                    <td key={x.recorte.rotulo} className={cn("py-[0.9vh] pl-4 text-right font-bold", c ? COR[c.status] : "")}>
                      {c?.valor ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
  ];

  return <Moldura titulo="Reunião operacional · Setor técnico" subtitulo={`Semana ${p.rotuloSemana} · ${p.status}`} secoes={SECOES} telas={telas} hrefVoltar={p.hrefVoltar} atual={atual} ir={ir} />;
}
