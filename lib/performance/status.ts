import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerEstado } from "./config-servidor";
import { custoIaDoMes } from "./ia/pipeline";

/**
 * Saúde das integrações do módulo (Configurações, 24/10/2026): coleta do
 * chat, fila e custo da IA, rotinas e últimos erros. Nunca devolve chave
 * ou segredo — só se existe e qual modelo está valendo.
 */
export type StatusIntegracoes = {
  coleta: {
    ultimaExecucao: string | null;
    ultimoResultado: { dia: string; novas: number; atualizadas: number; puladas: number; erros: number; ultimoErro?: string; proximaPagina: number | null }[];
    agentesSemVinculo: string[];
    conversasHoje: number;
    conversas7d: number;
    conversas7dComLead: number;
    ultimaConversa: string | null;
    primeiraConversa: string | null;
    porVersao: { versao: number; total: number }[];
  };
  ia: {
    chaveConfigurada: boolean;
    modeloIntegracao: string | null;
    fila: Record<string, number>;
    concluidasHoje: number;
    custoMesUsd: number;
    analisesMes: number;
    ultimosErros: { quando: string; erro: string }[];
    ultimaExecucao: { iniciado_em: string; status: string; conversas: number; custo: number; erro: string | null } | null;
  };
  rotinas: { entidade: string; iniciado_em: string; status: string; erro: string | null }[];
};

export async function statusIntegracoes(): Promise<StatusIntegracoes> {
  const admin = criarClienteAdmin();
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const seteDias = new Date(Date.parse(`${hoje}T03:00:00Z`) - 6 * 86_400_000).toISOString();
  const contar = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
  const [estado, anthropic, hojeN, seteN, seteLeadN, ultima, primeira, v1, v2, filaRows, concluidasHoje, doMes, erros, run, rotinas] = await Promise.all([
    lerEstado<{ ultimaExecucao?: string; ultimoResultado?: StatusIntegracoes["coleta"]["ultimoResultado"]; agentesSemVinculo?: string[] }>("performance_estado_coleta"),
    admin.from("integracoes_config").select("config").eq("sistema", "anthropic").maybeSingle(),
    contar(admin.from("conversas_atendimento").select("id", { count: "exact", head: true }).gte("finalizada_em", `${hoje}T00:00:00-03:00`)),
    contar(admin.from("conversas_atendimento").select("id", { count: "exact", head: true }).gte("finalizada_em", seteDias)),
    contar(admin.from("conversas_atendimento").select("id", { count: "exact", head: true }).gte("finalizada_em", seteDias).not("ticket_id", "is", null)),
    admin.from("conversas_atendimento").select("finalizada_em").not("finalizada_em", "is", null).order("finalizada_em", { ascending: false }).limit(1),
    admin.from("conversas_atendimento").select("finalizada_em").not("finalizada_em", "is", null).order("finalizada_em", { ascending: true }).limit(1),
    contar(admin.from("conversas_atendimento").select("id", { count: "exact", head: true }).eq("versao_calculo", 1)),
    contar(admin.from("conversas_atendimento").select("id", { count: "exact", head: true }).eq("versao_calculo", 2)),
    Promise.all(
      (["pendente", "processando", "concluida", "erro", "descartada"] as const).map((s) =>
        contar(admin.from("analises_conversa").select("id", { count: "exact", head: true }).eq("status", s)).then((n) => [s, n] as const)
      )
    ),
    contar(admin.from("analises_conversa").select("id", { count: "exact", head: true }).eq("status", "concluida").gte("concluido_em", `${hoje}T00:00:00-03:00`)),
    custoIaDoMes(hoje),
    admin.from("analises_conversa").select("erro, criado_em, iniciado_em").eq("status", "erro").order("criado_em", { ascending: false }).limit(5),
    admin.from("analise_runs").select("iniciado_em, status, conversas_analisadas, custo_estimado, erro").order("iniciado_em", { ascending: false }).limit(1),
    admin.from("sync_runs").select("entidade, iniciado_em, status, erro").like("entidade", "performance%").order("iniciado_em", { ascending: false }).limit(12),
  ]);
  const cfgIa = (anthropic.data?.config ?? {}) as { api_key?: string; modelo?: string };
  const r = run.data?.[0];
  return {
    coleta: {
      ultimaExecucao: estado.ultimaExecucao ?? null,
      ultimoResultado: Array.isArray(estado.ultimoResultado) ? estado.ultimoResultado : [],
      agentesSemVinculo: estado.agentesSemVinculo ?? [],
      conversasHoje: hojeN,
      conversas7d: seteN,
      conversas7dComLead: seteLeadN,
      ultimaConversa: (ultima.data?.[0]?.finalizada_em as string | undefined) ?? null,
      primeiraConversa: (primeira.data?.[0]?.finalizada_em as string | undefined) ?? null,
      porVersao: [
        { versao: 1, total: v1 },
        { versao: 2, total: v2 },
      ].filter((x) => x.total > 0),
    },
    ia: {
      chaveConfigurada: Boolean(cfgIa.api_key),
      modeloIntegracao: cfgIa.modelo ?? null,
      fila: Object.fromEntries(filaRows),
      concluidasHoje,
      custoMesUsd: doMes.usd,
      analisesMes: doMes.analises,
      ultimosErros: (erros.data ?? []).map((e) => ({ quando: (e.iniciado_em ?? e.criado_em) as string, erro: String(e.erro ?? "").slice(0, 200) })),
      ultimaExecucao: r
        ? { iniciado_em: r.iniciado_em as string, status: r.status as string, conversas: Number(r.conversas_analisadas ?? 0), custo: Number(r.custo_estimado ?? 0), erro: (r.erro as string | null) ?? null }
        : null,
    },
    rotinas: (rotinas.data ?? []).map((x) => ({ entidade: x.entidade as string, iniciado_em: x.iniciado_em as string, status: x.status as string, erro: (x.erro as string | null) ?? null })),
  };
}

export type RegistroAuditoria = { id: number; quando: string; usuario: string; acao: string; alvo: string | null; resumo: string | null };

const ROTULO_ACAO: Record<string, string> = {
  configuracao: "Alterou as configurações",
  configuracao_padrao: "Restaurou as configurações padrão",
  meta_criada: "Cadastrou meta",
  meta_desativada: "Desativou meta",
  indisponibilidade_registrada: "Registrou afastamento",
  indisponibilidade_removida: "Removeu afastamento",
  admissao: "Alterou data de admissão",
  ia_amostra_manual: "Rodou análise manual da IA",
  revisao_analise_ia: "Revisou análise da IA",
  ver_conversa: "Abriu uma conversa",
  exportar: "Exportou relatório",
  rotina_manual: "Rodou rotina manualmente",
};

/** o que mudou entre duas configurações (só caminhos de folha) */
function diferencas(antes: unknown, depois: unknown, caminho = "", saida: string[] = []): string[] {
  if (saida.length > 12) return saida;
  const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (obj(antes) && obj(depois)) {
    for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) diferencas(antes[k], depois[k], caminho ? `${caminho}.${k}` : k, saida);
  } else if (JSON.stringify(antes) !== JSON.stringify(depois)) {
    saida.push(`${caminho}: ${JSON.stringify(antes) ?? "—"} → ${JSON.stringify(depois) ?? "—"}`);
  }
  return saida;
}

export async function ultimasAuditorias(limite = 40): Promise<RegistroAuditoria[]> {
  const admin = criarClienteAdmin();
  const [{ data }, { data: usuarios }] = await Promise.all([
    admin.from("auditoria_performance").select("id, usuario_id, acao, alvo, antes, depois, criado_em").order("criado_em", { ascending: false }).limit(limite),
    admin.from("usuarios").select("id, nome"),
  ]);
  const nome = new Map((usuarios ?? []).map((u) => [u.id as string, u.nome as string]));
  return (data ?? []).map((a) => {
    let resumo: string | null = null;
    if (a.acao === "configuracao" || a.acao === "configuracao_padrao") {
      const d = diferencas(a.antes, a.depois);
      resumo = d.length ? d.slice(0, 6).join(" · ") + (d.length > 6 ? ` · +${d.length - 6}` : "") : "sem mudança efetiva";
    } else if (a.acao === "exportar") {
      const dep = a.depois as { periodo?: string; linhas?: number } | null;
      resumo = dep ? `${dep.periodo ?? ""} · ${dep.linhas ?? 0} linha(s)` : null;
    } else if (a.acao === "rotina_manual" || a.acao === "ia_amostra_manual") {
      resumo = a.depois ? JSON.stringify(a.depois).slice(0, 160) : null;
    }
    return {
      id: Number(a.id),
      quando: a.criado_em as string,
      usuario: nome.get(a.usuario_id as string) ?? "—",
      acao: ROTULO_ACAO[a.acao as string] ?? (a.acao as string),
      alvo: (a.alvo as string | null) ?? null,
      resumo,
    };
  });
}
