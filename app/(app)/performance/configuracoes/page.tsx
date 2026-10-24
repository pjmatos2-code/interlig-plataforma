import Link from "next/link";
import { redirect } from "next/navigation";
import { FormConfiguracoes, RotinasManuais } from "@/components/performance/form-config";
import { fmtData, fmtDataHora, fmtNum } from "@/components/performance/formato";
import { Painel } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { carregarConfig } from "@/lib/performance/config-servidor";
import { rotuloSetor } from "@/lib/performance/dados/calcular";
import { exigirEscopo } from "@/lib/performance/escopo";
import { MODELOS_OFERECIDOS } from "@/lib/performance/ia/custos";
import { ROTULO_CRITERIO, type Criterio } from "@/lib/performance/ia/schema";
import { statusIntegracoes, ultimasAuditorias } from "@/lib/performance/status";
import { VERSAO_CALCULO } from "@/lib/performance/coleta/persistir";

export const dynamic = "force-dynamic";
// as rotinas sob demanda rodam por até ~45 s
export const maxDuration = 60;

const usd = (v: number, casas = 2) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
const ROTULO_FILA: Record<string, string> = { pendente: "na fila", processando: "processando", concluida: "concluídas", erro: "com erro", descartada: "descartadas" };

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: React.ReactNode; tom?: "ok" | "alerta" | "erro" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn("text-right font-medium tabular-nums", tom === "ok" && "text-[hsl(152_60%_26%)]", tom === "alerta" && "text-[hsl(38_92%_28%)]", tom === "erro" && "text-farol-vermelho")}>{valor}</dd>
    </div>
  );
}

export default async function ConfiguracoesPage() {
  const escopo = await exigirEscopo();
  if (!escopo.podeConfigurar) redirect("/performance");
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const [cfg, st, auditoria, { data: setoresRows }] = await Promise.all([
    carregarConfig(),
    statusIntegracoes(),
    ultimasAuditorias(40),
    criarClienteAdmin().from("vendedores").select("setor").eq("ativo", true),
  ]);
  const setores = [...new Set([...(setoresRows ?? []).map((r) => r.setor as string | null).filter((x): x is string => Boolean(x)), ...cfg.setores])].sort();
  const modeloEfetivo = cfg.ia.modelo || st.ia.modeloIntegracao || "claude-haiku-5-5";
  const desatualizadas = st.coleta.porVersao.filter((v) => v.versao < VERSAO_CALCULO).reduce((s, v) => s + v.total, 0);
  const minutosColeta = st.coleta.ultimaExecucao ? Math.round((Date.now() - Date.parse(st.coleta.ultimaExecucao)) / 60_000) : null;
  const pctLead = st.coleta.conversas7d ? Math.round((st.coleta.conversas7dComLead / st.coleta.conversas7d) * 100) : null;

  return (
    <div className="space-y-4">
      <Painel titulo="Situação das integrações" descricao="Lido do banco agora. Nenhuma chave ou senha aparece aqui — só se existe.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 rounded-lg border p-3">
            <h3 className="mb-1 text-sm font-semibold">Coleta das conversas (SZ Chat)</h3>
            <dl>
              <Linha
                rotulo="Última rotina automática"
                valor={st.coleta.ultimaExecucao ? `${fmtDataHora(st.coleta.ultimaExecucao)}${minutosColeta !== null && minutosColeta > 60 ? ` (há ${Math.round(minutosColeta / 60)} h)` : ""}` : "ainda não rodou"}
                tom={!st.coleta.ultimaExecucao ? "alerta" : minutosColeta !== null && minutosColeta > 180 ? "alerta" : "ok"}
              />
              <Linha rotulo="Conversas encerradas hoje" valor={fmtNum(st.coleta.conversasHoje)} />
              <Linha rotulo="Últimos 7 dias" valor={`${fmtNum(st.coleta.conversas7d)} · ${pctLead === null ? "—" : `${pctLead}% com lead`}`} />
              <Linha rotulo="Histórico desde" valor={fmtData(st.coleta.primeiraConversa)} />
              <Linha rotulo="Na regra de cálculo antiga" valor={desatualizadas ? `${fmtNum(desatualizadas)} — atualize nas rotinas` : "nenhuma"} tom={desatualizadas ? "alerta" : "ok"} />
            </dl>
            {st.coleta.ultimoResultado.some((r) => r.erros > 0) && (
              <p className="mt-2 text-xs text-[hsl(38_92%_28%)]">
                Última rodada com erro: {st.coleta.ultimoResultado.filter((r) => r.erros).map((r) => `${r.dia} (${r.erros}${r.ultimoErro ? `: ${r.ultimoErro.slice(0, 80)}` : ""})`).join("; ")}
              </p>
            )}
            {st.coleta.agentesSemVinculo.length > 0 && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  {st.coleta.agentesSemVinculo.length} atendente(s) de outros setores em conversas comerciais
                </summary>
                <p className="mt-1">
                  Normal quando o cliente chega na equipe errada ou é transferido para suporte, financeiro etc. As mensagens dessas pessoas não contam esforço para
                  ninguém: {st.coleta.agentesSemVinculo.join(", ")}. Só se um <b className="font-medium text-foreground">vendedor</b> aparecer nesta lista (ex.: alguém
                  novo, ou nome diferente no chat),{" "}
                  <Link href="/admin" className="font-medium text-interlig-azul hover:underline">
                    vincule em Administração
                  </Link>{" "}
                  e recalcule as conversas.
                </p>
              </details>
            )}
          </div>

          <div className="min-w-0 rounded-lg border p-3">
            <h3 className="mb-1 text-sm font-semibold">Inteligência artificial</h3>
            <dl>
              <Linha rotulo="Chave da Anthropic (Integrações)" valor={st.ia.chaveConfigurada ? "configurada" : "não configurada"} tom={st.ia.chaveConfigurada ? "ok" : "erro"} />
              <Linha rotulo="Análise automática" valor={cfg.ia.habilitada ? "ligada" : "desligada"} tom={cfg.ia.habilitada ? "ok" : undefined} />
              <Linha rotulo="Modelo em uso" valor={<span className="font-mono text-xs">{modeloEfetivo}</span>} />
              <Linha rotulo="Fila" valor={Object.entries(st.ia.fila).filter(([, n]) => n > 0).map(([k, n]) => `${fmtNum(n)} ${ROTULO_FILA[k] ?? k}`).join(" · ") || "vazia"} />
              <Linha rotulo="Analisadas hoje" valor={`${fmtNum(st.ia.concluidasHoje)} de ${fmtNum(cfg.ia.limite_diario)}`} />
              <Linha rotulo="Custo estimado no mês" valor={`${usd(st.ia.custoMesUsd)} de ${usd(cfg.ia.custo_max_mensal_usd, 0)}`} tom={st.ia.custoMesUsd >= cfg.ia.custo_max_mensal_usd ? "erro" : st.ia.custoMesUsd >= cfg.ia.custo_max_mensal_usd * 0.8 ? "alerta" : undefined} />
            </dl>
            {st.ia.ultimosErros.length > 0 && (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[hsl(38_92%_28%)]">{st.ia.ultimosErros.length} erro(s) recente(s)</summary>
                <ul className="mt-1 space-y-1 text-muted-foreground">
                  {st.ia.ultimosErros.map((e, i) => (
                    <li key={i}>
                      {fmtDataHora(e.quando)} — {e.erro}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!st.ia.chaveConfigurada && (
              <p className="mt-2 text-xs text-muted-foreground">
                Sem chave, as telas mostram &quot;IA indisponível&quot; e nada é inventado.{" "}
                <Link href="/admin/integracoes" className="font-medium text-interlig-azul hover:underline">
                  Configurar em Integrações
                </Link>
              </p>
            )}
          </div>

          <div className="min-w-0 rounded-lg border p-3">
            <h3 className="mb-1 text-sm font-semibold">Rotinas automáticas</h3>
            {st.rotinas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma execução registrada. A coleta, os follow-ups, os alertas e a IA passam a rodar na rotina de sincronização depois da publicação desta versão.</p>
            ) : (
              <ul className="divide-y text-sm">
                {st.rotinas.map((r, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">{r.entidade.replace("performance_", "")}</span>
                    <span className={cn("shrink-0 text-xs", r.status === "erro" ? "text-farol-vermelho" : "text-muted-foreground")} title={r.erro ?? undefined}>
                      {fmtDataHora(r.iniciado_em)} · {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {st.ia.ultimaExecucao && (
              <p className="mt-2 text-xs text-muted-foreground">
                Última rodada da IA: {fmtDataHora(st.ia.ultimaExecucao.iniciado_em)} · {st.ia.ultimaExecucao.conversas} conversa(s) · {usd(st.ia.ultimaExecucao.custo, 3)} · {st.ia.ultimaExecucao.status}
              </p>
            )}
          </div>
        </div>
      </Painel>

      <Painel titulo="Rotinas sob demanda" descricao="As mesmas da rotina automática, para corrigir um dia que falhou ou aplicar uma regra nova ao histórico.">
        <RotinasManuais hoje={hoje} />
      </Painel>

      <FormConfiguracoes
        inicial={cfg}
        modelos={MODELOS_OFERECIDOS.map((m) => ({ id: m.id, rotulo: m.rotulo }))}
        modeloIntegracao={st.ia.modeloIntegracao}
        rotulosRubrica={Object.fromEntries(Object.keys(cfg.ia.rubrica).map((k) => [k, ROTULO_CRITERIO[k as Criterio] ?? k]))}
        setoresDisponiveis={setores.map((s) => ({ id: s, rotulo: rotuloSetor(s) }))}
      />

      <Painel titulo="Trilha de auditoria" descricao="Últimas 40 ações do módulo: configurações, metas, afastamentos, revisões da IA, exportações e acesso ao conteúdo de conversas.">
        {auditoria.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Quando</th>
                  <th className="py-2 font-medium">Quem</th>
                  <th className="py-2 font-medium">O quê</th>
                  <th className="py-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.map((a) => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-foreground">{fmtDataHora(a.quando)}</td>
                    <td className="py-2 pr-3">{a.usuario}</td>
                    <td className="py-2 pr-3">{a.acao}</td>
                    <td className="max-w-[28rem] break-words py-2 text-xs text-muted-foreground">{a.resumo ?? a.alvo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </div>
  );
}
