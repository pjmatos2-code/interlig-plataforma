"use client";

import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { recoletarDiaPerf, restaurarPadraoPerf, rodarRotinaPerf, salvarConfigPerf, type Resposta } from "@/app/(app)/performance/acoes";
import type { ConfigPerformance } from "@/lib/performance/config";
import { cn } from "@/lib/utils";

type Cfg = ConfigPerformance;
type Opcao = { id: string; rotulo: string };

const ler = (o: unknown, caminho: string): unknown => caminho.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], o);

function Retorno({ msg }: { msg: Resposta | null }) {
  if (!msg) return null;
  return (
    <span role="status" className={cn("text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>
      {msg.erro ?? msg.ok}
    </span>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <legend className="sr-only">{titulo}</legend>
      <h2 className="text-base font-semibold">{titulo}</h2>
      {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

type CtxCfg = { cfg: Cfg; definir: (caminho: string, valor: unknown) => void };
const ContextoCfg = createContext<CtxCfg | null>(null);
function useCfg(): CtxCfg {
  const c = useContext(ContextoCfg);
  if (!c) throw new Error("campo fora do formulário de configurações");
  return c;
}

/** número com texto local: aceita vírgula e estados intermediários ("92,") sem perder o que foi digitado */
function Numero({ caminho, rotulo, ajuda, tipo = "num", min = 0, max }: { caminho: string; rotulo: string; ajuda?: string; tipo?: "num" | "pct"; min?: number; max?: number }) {
  const { cfg, definir } = useCfg();
  const v = ler(cfg, caminho) as number;
  const mostrado = tipo === "pct" ? Math.round(v * 1000) / 10 : v;
  const [texto, setTexto] = useState(String(mostrado).replace(".", ","));
  useEffect(() => {
    // mudou por fora (descartar/restaurar): reflete no campo
    if (Number(texto.replace(",", ".")) !== mostrado) setTexto(String(mostrado).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrado]);
  const n = Number(texto.replace(",", "."));
  const teto = tipo === "pct" ? 100 : max;
  const invalido = texto.trim() === "" || !Number.isFinite(n) || n < min || (teto !== undefined && n > teto);
  return (
    <label className="block min-w-0 text-xs">
      <span className="mb-1 block text-muted-foreground">
        {rotulo}
        {tipo === "pct" ? " (%)" : ""}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={texto}
        aria-invalid={invalido}
        onChange={(e) => {
          const t = e.target.value;
          setTexto(t);
          const x = Number(t.replace(",", "."));
          if (t.trim() !== "" && Number.isFinite(x) && x >= min && (teto === undefined || x <= teto)) definir(caminho, tipo === "pct" ? Math.round(x * 10) / 1000 : x);
        }}
        className={cn("h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm tabular-nums", invalido && "border-farol-vermelho")}
      />
      {ajuda && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{ajuda}</span>}
    </label>
  );
}

function Liga({ caminho, rotulo, ajuda }: { caminho: string; rotulo: string; ajuda?: string }) {
  const { cfg, definir } = useCfg();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={Boolean(ler(cfg, caminho))} onChange={(e) => definir(caminho, e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" />
      <span>
        {rotulo}
        {ajuda && <span className="block text-[11px] leading-4 text-muted-foreground">{ajuda}</span>}
      </span>
    </label>
  );
}

function Faixa({ caminho, rotulo }: { caminho: string; rotulo: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/30 p-2">
      <p className="mb-1 text-xs font-medium">{rotulo}</p>
      <div className="grid grid-cols-2 gap-2">
        <Numero caminho={`${caminho}.piso`} rotulo="Vale 0 em" tipo="pct" />
        <Numero caminho={`${caminho}.alvo`} rotulo="Vale 100 em" tipo="pct" />
      </div>
    </div>
  );
}

function Pesos({ grupo, itens }: { grupo: keyof Cfg["pesos"]; itens: [string, string][] }) {
  const { cfg } = useCfg();
  const soma = itens.reduce((s, [k]) => s + Number((cfg.pesos[grupo] as Record<string, number>)[k] ?? 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {itens.map(([k, r]) => (
          <Numero key={k} caminho={`pesos.${grupo}.${k}`} rotulo={r} max={100} />
        ))}
      </div>
      <p className={cn("mt-1 text-[11px]", soma === 100 ? "text-muted-foreground" : "text-[hsl(38_92%_28%)]")}>
        Soma: {soma}. {soma === 100 ? "" : "Os pesos valem em proporção (a soma não precisa ser 100), mas 100 facilita a leitura. "}Indicador sem dado sai da conta e o peso dele é redistribuído.
      </p>
    </div>
  );
}

/**
 * Configurações da Performance Comercial (gestor). O formulário monta o
 * objeto inteiro; o servidor mescla com os padrões e saneia (número fora da
 * faixa volta ao padrão) e grava na trilha de auditoria.
 */
export function FormConfiguracoes({
  inicial,
  modelos,
  modeloIntegracao,
  rotulosRubrica,
  setoresDisponiveis,
}: {
  inicial: Cfg;
  modelos: Opcao[];
  modeloIntegracao: string | null;
  rotulosRubrica: Record<string, string>;
  setoresDisponiveis: Opcao[];
}) {
  const [cfg, setCfg] = useState<Cfg>(inicial);
  const [base, setBase] = useState<Cfg>(inicial);
  const [porSetorTxt, setPorSetorTxt] = useState(() => JSON.stringify(inicial.pesos_por_setor, null, 2));
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [pendente, iniciar] = useTransition();
  const [confirmarPadrao, setConfirmarPadrao] = useState(false);

  const porSetorValido = useMemo(() => {
    try {
      const v = JSON.parse(porSetorTxt || "{}");
      return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Cfg["pesos_por_setor"]) : null;
    } catch {
      return null;
    }
  }, [porSetorTxt]);
  const alterado = JSON.stringify(cfg) !== JSON.stringify(base) || JSON.stringify(porSetorValido) !== JSON.stringify(base.pesos_por_setor);

  const definir = (caminho: string, valor: unknown) =>
    setCfg((prev) => {
      const c = structuredClone(prev) as unknown as Record<string, unknown>;
      const ks = caminho.split(".");
      let o = c;
      for (const k of ks.slice(0, -1)) o = o[k] as Record<string, unknown>;
      o[ks[ks.length - 1]] = valor;
      return c as unknown as Cfg;
    });

  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const turnoDe = (dia: string, i: number) => cfg.expediente[dia]?.[i] ?? null;
  const definirTurno = (dia: string, i: number, pos: 0 | 1, hora: string) => {
    const turnos = structuredClone(cfg.expediente[dia] ?? []);
    if (!turnos[i]) turnos[i] = ["08:00", "12:00"];
    turnos[i][pos] = hora;
    definir(`expediente.${dia}`, turnos);
  };

  function salvar() {
    if (!porSetorValido) {
      setMsg({ erro: "Os pesos por função não são um JSON válido." });
      return;
    }
    const enviar = { ...cfg, pesos_por_setor: porSetorValido };
    iniciar(async () => {
      const r = await salvarConfigPerf(JSON.stringify(enviar));
      setMsg(r);
      if (r.ok) setBase(enviar);
    });
  }

  return (
    <ContextoCfg.Provider value={{ cfg, definir }}>
    <div className="space-y-4 pb-24">
      <Secao titulo="Módulo" descricao="Desligado, as rotinas automáticas (coleta, follow-ups, alertas e IA) param; as telas continuam mostrando o que já foi apurado.">
        <Liga caminho="modulo_ativo" rotulo="Módulo Performance Comercial ativo" />
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">Funções (setores) avaliadas</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {setoresDisponiveis.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={cfg.setores.includes(s.id)}
                  onChange={(e) => definir("setores", e.target.checked ? [...cfg.setores, s.id] : cfg.setores.filter((x) => x !== s.id))}
                  className="h-4 w-4 accent-[hsl(var(--primary))]"
                />
                {s.rotulo}
              </label>
            ))}
          </div>
        </div>
      </Secao>

      <Secao titulo="Pesos do IPC e dos componentes" descricao="IPC = Esforço + Resultado + Qualidade, cada um de 0 a 100. Mudança de peso vale para todos os períodos na próxima abertura das telas.">
        <p className="mb-1 text-xs font-medium">IPC</p>
        <Pesos grupo="ipc" itens={[["esforco", "Esforço"], ["resultado", "Resultado"], ["qualidade", "Qualidade"]]} />
        <p className="mb-1 mt-4 text-xs font-medium">Esforço comercial</p>
        <Pesos
          grupo="esforco"
          itens={[
            ["leads_atendidos", "Leads atendidos"],
            ["sla_primeira_resposta", "SLA da 1ª resposta"],
            ["followups_prazo", "Follow-ups no prazo"],
            ["sem_atraso", "Sem leads atrasados"],
            ["conversas_trabalhadas", "Conversas trabalhadas"],
            ["propostas", "Propostas"],
            ["recuperacao", "Recuperação de leads"],
            ["disciplina_crm", "Disciplina do CRM"],
          ]}
        />
        <p className="mb-1 mt-4 text-xs font-medium">Resultado</p>
        <Pesos grupo="resultado" itens={[["meta_vendas", "Meta de vendas"], ["conversao", "Conversão"], ["receita_nova", "Receita nova"]]} />
        <p className="mb-1 mt-4 text-xs font-medium">Qualidade</p>
        <Pesos grupo="qualidade" itens={[["qualidade_vendas", "Qualidade das vendas"], ["qualidade_atendimento", "Qualidade do atendimento (IA)"]]} />
        <details className="mt-4 rounded-lg border bg-muted/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Pesos diferentes por função (avançado)</summary>
          <p className="mt-2 text-[11px] text-muted-foreground">
            JSON por setor; só as chaves informadas sobrescrevem os pesos gerais. Ex.: {"{"}&quot;comercial_externo&quot;: {"{"}&quot;esforco&quot;: {"{"}&quot;conversas_trabalhadas&quot;: 0{"}"}{"}"}{"}"}
          </p>
          <textarea value={porSetorTxt} onChange={(e) => setPorSetorTxt(e.target.value)} rows={6} spellCheck={false} className={cn("mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs", !porSetorValido && "border-farol-vermelho")} />
          {!porSetorValido && <p className="text-xs text-farol-vermelho">JSON inválido.</p>}
        </details>
      </Secao>

      <Secao titulo="Normalização das notas (0 a 100)" descricao="Abaixo do primeiro valor a nota é 0; no segundo valor ou acima, 100; linear no meio.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Faixa caminho="faixas.leads_atendidos" rotulo="Leads atendidos" />
          <Faixa caminho="faixas.sla_primeira_resposta" rotulo="SLA da 1ª resposta" />
          <Faixa caminho="faixas.followups_prazo" rotulo="Follow-ups no prazo" />
          <Faixa caminho="faixas.conversas_trabalhadas" rotulo="Conversas trabalhadas" />
          <Faixa caminho="faixas.propostas" rotulo="Propostas por lead" />
          <Faixa caminho="faixas.recuperacao" rotulo="Recuperação de leads" />
          <Faixa caminho="faixas.disciplina_crm" rotulo="Disciplina do CRM" />
          <Faixa caminho="faixas.conversao" rotulo="Conversão" />
        </div>
        <div className="mt-3 max-w-xs">
          <Numero caminho="faixas.sem_atraso_limite" rotulo="Leads sem retorno que zeram o item 'sem atraso'" tipo="pct" ajuda="fração dos leads abertos do vendedor" />
        </div>
      </Secao>

      <Secao titulo="SLA e expediente" descricao="Tempos contam só dentro do expediente; feriados vêm do calendário da empresa.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Numero caminho="sla.primeira_resposta_min" rotulo="1ª resposta humana em até (min)" min={1} />
          <Numero caminho="sla.sem_retorno_horas" rotulo="Lead sem retorno depois de (horas úteis)" min={1} />
          <Numero caminho="lead_quente.minutos_sem_resposta" rotulo="Lead quente esperando — alerta crítico após (min)" min={1} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Dia</th>
                <th className="py-1.5 font-medium">Aberto</th>
                <th className="py-1.5 font-medium">Turno 1</th>
                <th className="py-1.5 font-medium">Turno 2 (opcional)</th>
              </tr>
            </thead>
            <tbody>
              {["1", "2", "3", "4", "5", "6", "0"].map((d) => {
                const aberto = (cfg.expediente[d] ?? []).length > 0;
                const t1 = turnoDe(d, 0);
                const t2 = turnoDe(d, 1);
                return (
                  <tr key={d} className="border-t">
                    <td className="py-1.5">{DIAS[Number(d)]}</td>
                    <td className="py-1.5">
                      <input type="checkbox" aria-label={`${DIAS[Number(d)]} aberto`} checked={aberto} onChange={(e) => definir(`expediente.${d}`, e.target.checked ? [["08:00", "18:00"]] : [])} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                    </td>
                    <td className="py-1.5">
                      {t1 && (
                        <span className="flex items-center gap-1">
                          <input type="time" aria-label={`${DIAS[Number(d)]} início`} value={t1[0]} onChange={(e) => definirTurno(d, 0, 0, e.target.value)} className="h-8 rounded-md border bg-background px-1 text-sm" />
                          –
                          <input type="time" aria-label={`${DIAS[Number(d)]} fim`} value={t1[1]} onChange={(e) => definirTurno(d, 0, 1, e.target.value)} className="h-8 rounded-md border bg-background px-1 text-sm" />
                        </span>
                      )}
                    </td>
                    <td className="py-1.5">
                      {aberto &&
                        (t2 ? (
                          <span className="flex items-center gap-1">
                            <input type="time" aria-label={`${DIAS[Number(d)]} início do turno 2`} value={t2[0]} onChange={(e) => definirTurno(d, 1, 0, e.target.value)} className="h-8 rounded-md border bg-background px-1 text-sm" />
                            –
                            <input type="time" aria-label={`${DIAS[Number(d)]} fim do turno 2`} value={t2[1]} onChange={(e) => definirTurno(d, 1, 1, e.target.value)} className="h-8 rounded-md border bg-background px-1 text-sm" />
                            <button type="button" onClick={() => definir(`expediente.${d}`, (cfg.expediente[d] ?? []).slice(0, 1))} className="ml-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted">
                              tirar
                            </button>
                          </span>
                        ) : (
                          <button type="button" onClick={() => definir(`expediente.${d}`, [...(cfg.expediente[d] ?? []), ["14:00", "18:00"]])} className="rounded px-1.5 py-0.5 text-xs text-interlig-azul hover:bg-muted">
                            + turno
                          </button>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Turnos precisam ter início antes do fim e não se sobrepor. Depois de mudar o expediente, recalcule as conversas (seção Rotinas) para os tempos antigos seguirem a regra nova.</p>
      </Secao>

      <Secao titulo="Justiça da comparação" descricao="Sem volume mínimo o indicador aparece como 'volume insuficiente' (nunca zero) e o peso dele vai para os demais.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Numero caminho="volume_minimo.leads" rotulo="Leads" />
          <Numero caminho="volume_minimo.conversas" rotulo="Conversas" />
          <Numero caminho="volume_minimo.fechados" rotulo="Leads fechados (conversão)" />
          <Numero caminho="volume_minimo.vendas_maduras" rotulo="Vendas maduras (qualidade)" />
          <Numero caminho="volume_minimo.analises_ia" rotulo="Conversas analisadas pela IA" />
          <Numero caminho="volume_minimo.propostas_equipe" rotulo="Propostas da equipe (30 dias)" />
          <Numero caminho="volume_minimo.followups" rotulo="Follow-ups devidos" />
          <Numero caminho="volume_minimo.recuperacao" rotulo="Leads perdidos (recuperação)" />
          <Numero caminho="volume_minimo.abertos" rotulo="Leads abertos (sem atraso)" />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Numero caminho="cobertura_minima_ranking" rotulo="Cobertura mínima do esforço para entrar no ranking" tipo="pct" />
          <Numero caminho="rampa_dias" rotulo="Dias de rampa após a admissão" />
          <div className="flex items-end pb-2">
            <Liga caminho="rampa_no_ranking" rotulo="Recém-contratado entra no ranking" />
          </div>
        </div>
      </Secao>

      <Secao titulo="Follow-ups" descricao="Execução = primeira ação humana no lead depois do agendamento (mensagem, nota, tratativa ou proposta).">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs">
            <span className="mb-1 block text-muted-foreground">Conta como no prazo</span>
            <select value={cfg.followup.tolerancia} onChange={(e) => definir("followup.tolerancia", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="fim_do_dia">Até o fim do dia do prazo</option>
              <option value="horario_exato">Até o horário exato</option>
            </select>
          </label>
          <Numero caminho="followup.carencia_min" rotulo="Carência após agendar (min)" ajuda="ação logo depois de agendar é a mesma conversa, não execução" />
          <div className="flex items-end pb-2">
            <Liga caminho="followup.incluir_automaticos" rotulo="Contar retornos automáticos do robô" ajuda="por padrão ficam fora da taxa de execução" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <Liga caminho="lead_quente.usar_ia" rotulo="Lead quente pela classificação da IA" />
          <Liga caminho="lead_quente.usar_urgencia_alta" rotulo="Lead quente pela urgência alta do CRM" />
        </div>
      </Secao>

      <Secao titulo="Qualidade das vendas" descricao="Coortes só são avaliadas depois da maturidade; até lá aparecem como 'aguardando maturação'.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Numero caminho="qualidade.maturidade_dias" rotulo="Maturidade (dias após a venda)" min={1} />
          <Numero caminho="qualidade.janela_dias" rotulo="Tamanho da coorte avaliada (dias)" min={7} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["cancel_antes_instalacao", "Cancelamento antes da instalação"],
            ["cancel_30", "Cancelamento em 30 dias"],
            ["churn_90", "Churn em 90 dias"],
            ["inad_1a", "Inadimplência da 1ª fatura"],
          ].map(([k, r]) => (
            <div key={k} className="min-w-0 rounded-lg bg-muted/30 p-2">
              <p className="mb-1 text-xs font-medium">{r}</p>
              <div className="grid grid-cols-2 gap-2">
                <Numero caminho={`qualidade.${k}.alvo`} rotulo="Nota 100 até" tipo="pct" />
                <Numero caminho={`qualidade.${k}.maximo`} rotulo="Nota 0 a partir de" tipo="pct" />
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Alertas" descricao="Alertas iguais são agrupados; só críticos novos notificam (vendedor e coordenação), com teto diário.">
        <div className="mb-3">
          <Liga caminho="alertas.notificar_criticos" rotulo="Notificar alertas críticos (sino da plataforma)" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Numero caminho="alertas.max_notificacoes_dia" rotulo="Máximo de notificações por dia" />
          <Numero caminho="alertas.followups_acumulados" rotulo="Follow-ups acumulados (atenção)" />
          <Numero caminho="alertas.conversao_abaixo" rotulo="Conversão abaixo do alvo" tipo="pct" ajuda="fração do alvo de conversão" />
          <Numero caminho="alertas.queda_produtividade" rotulo="Queda de produtividade" tipo="pct" ajuda="7 dias úteis ÷ média de 30" />
          <Numero caminho="alertas.disciplina_minima" rotulo="Disciplina do CRM mínima" tipo="pct" />
        </div>
      </Secao>

      <Secao titulo="Inteligência artificial das conversas" descricao="A IA só lê conversas comerciais já mascaradas (CPF, telefone, e-mail, endereço). Saída validada por schema; o que ela diz aparece como inferência, nunca como fato.">
        <div className="mb-3 rounded-lg border border-farol-amarelo/40 bg-farol-amarelo/10 p-3">
          <Liga caminho="ia.habilitada" rotulo="Análise automática ligada" ajuda="A rotina analisa as conversas novas dentro dos limites abaixo. Custo estimado: cerca de US$ 0,01 por conversa nos modelos menores." />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs sm:col-span-2 lg:col-span-1">
            <span className="mb-1 block text-muted-foreground">Modelo</span>
            <select value={cfg.ia.modelo} onChange={(e) => definir("ia.modelo", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">O de Integrações{modeloIntegracao ? ` (${modeloIntegracao})` : ""}</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
          <Numero caminho="ia.limite_diario" rotulo="Máximo de análises por dia" />
          <Numero caminho="ia.custo_max_mensal_usd" rotulo="Teto de custo no mês (US$)" />
          <Numero caminho="ia.retencao_texto_dias" rotulo="Guardar o texto das mensagens por (dias)" min={7} ajuda="depois disso o texto é apagado; ficam só as métricas" />
          <Numero caminho="ia.min_msgs_cliente" rotulo="Mínimo de mensagens do cliente para analisar" min={1} />
        </div>
        <p className="mb-1 mt-4 text-xs font-medium">Rubrica da qualidade do atendimento (peso de cada critério; 0 desliga)</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {Object.keys(cfg.ia.rubrica).map((k) => (
            <Numero key={k} caminho={`ia.rubrica.${k}`} rotulo={rotulosRubrica[k] ?? k} max={100} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Coleta do chat e acesso" descricao="Coleta só leitura do SZ (conta robô). Quem não abre o módulo não vê o menu nem recebe os avisos de alerta. O conteúdo das conversas é dado pessoal: libere só para quem precisa.">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-end pb-2">
            <Liga caminho="coleta.habilitada" rotulo="Coleta automática ligada" />
          </div>
          <Numero caminho="coleta.dias_retroativos" rotulo="Dias que a rotina revisa para trás" />
        </div>
        <p className="mb-1 mt-3 text-xs text-muted-foreground">Quem abre o módulo Performance Comercial (o administrador sempre abre)</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["diretoria", "Diretoria"],
            ["supervisor", "Supervisores e coordenadores (só o próprio time ou unidade)"],
            ["vendedor", "Vendedores (só os próprios números)"],
          ].map(([k, r]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.acesso.papeis_modulo.includes(k)}
                onChange={(e) => definir("acesso.papeis_modulo", e.target.checked ? [...new Set([...cfg.acesso.papeis_modulo, k])] : cfg.acesso.papeis_modulo.filter((x) => x !== k))}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {r}
            </label>
          ))}
        </div>
        <p className="mb-1 mt-3 text-xs text-muted-foreground">Quem lê o conteúdo das conversas (resumos e mensagens), além do próprio vendedor</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {[
            ["gestor", "Gestor (sempre)"],
            ["direcao", "Diretoria"],
            ["supervisor", "Supervisores e coordenadores (só o próprio time)"],
          ].map(([k, r]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                disabled={k === "gestor"}
                checked={k === "gestor" || cfg.acesso.conversas.includes(k)}
                onChange={(e) => definir("acesso.conversas", e.target.checked ? [...new Set([...cfg.acesso.conversas, k])] : cfg.acesso.conversas.filter((x) => x !== k))}
                className="h-4 w-4 accent-[hsl(var(--primary))]"
              />
              {r}
            </label>
          ))}
        </div>
      </Secao>

      {/* barra de salvar: fixa no rodapé para não perder alteração em formulário longo */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={salvar} disabled={pendente || !alterado} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-medium text-white disabled:opacity-50">
            {pendente ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Salvar alterações
          </button>
          <button
            type="button"
            disabled={pendente || !alterado}
            onClick={() => {
              setCfg(base);
              setPorSetorTxt(JSON.stringify(base.pesos_por_setor, null, 2));
              setMsg(null);
            }}
            className="h-9 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"
          >
            Descartar
          </button>
          {confirmarPadrao ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    const r = await restaurarPadraoPerf();
                    setMsg(r);
                    setConfirmarPadrao(false);
                    if (r.ok) window.location.reload();
                  })
                }
                className="h-9 rounded-md border border-farol-vermelho/40 px-3 text-sm font-medium text-farol-vermelho hover:bg-farol-vermelho/10"
              >
                Confirmar restauração
              </button>
              <button type="button" onClick={() => setConfirmarPadrao(false)} className="h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted">
                Voltar
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmarPadrao(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Restaurar padrões
            </button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{alterado ? "Há alterações não salvas." : "Tudo salvo."}</span>
          <Retorno msg={msg} />
        </div>
      </div>
    </div>
    </ContextoCfg.Provider>
  );
}

/** rotinas sob demanda (as mesmas da rotina automática) */
export function RotinasManuais({ hoje }: { hoje: string }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [dia, setDia] = useState(() => new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  const [pagina, setPagina] = useState<number | null>(null);
  const [rodando, setRodando] = useState<string | null>(null);
  const rodar = (chave: string, f: () => Promise<Resposta>) => {
    setRodando(chave);
    iniciar(async () => {
      setMsg(await f());
      setRodando(null);
    });
  };
  const botao = (chave: string, rotulo: string, f: () => Promise<Resposta>) => (
    <button type="button" disabled={pendente} onClick={() => rodar(chave, f)} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50">
      {rodando === chave && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {rotulo}
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {botao("followups", "Importar e avaliar follow-ups", () => rodarRotinaPerf("followups"))}
        {botao("alertas", "Recalcular alertas (sem notificar)", () => rodarRotinaPerf("alertas"))}
        {botao("recalcular", "Atualizar conversas para a regra atual", () => rodarRotinaPerf("recalcular"))}
        {botao("recalcular_todas", cursor ? "Continuar recálculo de todas" : "Recalcular todas as conversas", async () => {
          const r = await rodarRotinaPerf("recalcular_todas", cursor ?? undefined);
          setCursor(r.cursor ?? null);
          return r;
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Coletar de novo o chat do dia</span>
          <input
            type="date"
            value={dia}
            max={hoje}
            min="2026-07-01"
            onChange={(e) => {
              setDia(e.target.value);
              setPagina(null);
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          />
        </label>
        {botao("coleta", pagina ? `Continuar (página ${pagina})` : "Coletar", async () => {
          const r = await recoletarDiaPerf(dia, pagina ?? 1);
          setPagina(r.proximaPagina ?? null);
          return r;
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Cada rodada usa até ~45 s; quando sobrar trabalho, o botão vira &quot;continuar&quot;. A coleta lê o SZ com a conta robô e pula o que já está em dia. Tudo fica na trilha de auditoria.</p>
      <Retorno msg={msg} />
    </div>
  );
}
