import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { hojeSantarem, somarDias } from "@/lib/relatorio-semanal/periodo";
import type { Compromisso } from "./reunioes";
import { precisaAvisoDePrazo, type Diagnostico, type EventoPlano, type Plano } from "./planos";

/**
 * Leitura de diagnósticos e planos com a sessão de quem abre (a permissão por
 * linha decide o recorte) e os avisos no sino (tabela `notificacoes`, a mesma
 * do CRM), gravados pelo cliente de serviço.
 */

const CAMPOS_DIAG = "id, periodo_inicio, periodo_fim, indicador, escopo_tipo, escopo_ref, escopo_rotulo, versao, causa, evidencias, providencias, solucao, situacao_indicador, valor, meta, criado_em, criado_por";
const CAMPOS_PLANO =
  "id, indicador, problema, periodo_inicio, escopo_tipo, escopo_ref, escopo_rotulo, diagnostico_id, reuniao_id, descricao, resultado_esperado, responsavel_id, responsavel_nome, prazo, situacao, aprovacao, aprovacao_justificativa, aprovacao_por, aprovacao_em, criado_em, criado_por, atualizado_em";

/** diagnósticos de uma semana (todas as versões, de todos os recortes visíveis) */
export async function diagnosticosDaSemana(periodoInicio: string): Promise<{ disponivel: boolean; lista: Diagnostico[] }> {
  const { data, error } = await criarClienteServidor().from("grr_diagnosticos").select(CAMPOS_DIAG).eq("periodo_inicio", periodoInicio).order("versao", { ascending: false });
  if (error) return { disponivel: false, lista: [] };
  return { disponivel: true, lista: (data ?? []) as Diagnostico[] };
}

export async function listarPlanos(): Promise<{ disponivel: boolean; planos: Plano[] }> {
  const { data, error } = await criarClienteServidor().from("grr_acoes").select(CAMPOS_PLANO).order("criado_em", { ascending: false }).limit(300);
  if (error) return { disponivel: false, planos: [] };
  return { disponivel: true, planos: (data ?? []) as Plano[] };
}

export async function lerPlano(id: string): Promise<{ plano: Plano; eventos: EventoPlano[]; diagnostico: Diagnostico | null } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = criarClienteServidor();
  const { data } = await db.from("grr_acoes").select(CAMPOS_PLANO).eq("id", id).maybeSingle();
  if (!data) return null;
  const plano = data as Plano;
  const [{ data: eventos }, { data: diagnostico }] = await Promise.all([
    db.from("grr_acao_eventos").select("id, tipo, texto, dados, criado_em, criado_por").eq("acao_id", id).order("criado_em"),
    plano.diagnostico_id ? db.from("grr_diagnosticos").select(CAMPOS_DIAG).eq("id", plano.diagnostico_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { plano, eventos: (eventos ?? []) as EventoPlano[], diagnostico: (diagnostico as Diagnostico | null) ?? null };
}

/** compromissos gerenciais das reuniões de equipe que esperam a diretoria */
export async function compromissosAguardando(): Promise<(Compromisso & { reuniao: { escopo_rotulo: string; data_reuniao: string } | null })[]> {
  const db = criarClienteServidor();
  const { data } = await db
    .from("grr_compromissos")
    .select("id, reuniao_id, tipo, agente_id, responsavel_nome, descricao, prazo, situacao, aprovacao, conferido_em, criado_em")
    .eq("tipo", "gerencial")
    .eq("aprovacao", "aguardando")
    .order("criado_em");
  const lista = (data ?? []) as Compromisso[];
  if (!lista.length) return [];
  const { data: reunioes } = await db.from("grr_reunioes").select("id, escopo_rotulo, data_reuniao").in("id", [...new Set(lista.map((c) => c.reuniao_id))]);
  const porId = new Map((reunioes ?? []).map((r) => [r.id as string, { escopo_rotulo: String(r.escopo_rotulo), data_reuniao: String(r.data_reuniao) }]));
  return lista.map((c) => ({ ...c, reuniao: porId.get(c.reuniao_id) ?? null }));
}

/** nomes de quem escreveu (diagnósticos e histórico) */
export async function nomesDeUsuarios(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map();
  const { data } = await criarClienteAdmin().from("usuarios").select("id, nome").in("id", unicos);
  return new Map((data ?? []).map((u) => [u.id as string, String(u.nome)]));
}

/** quem pode ser responsável principal: quem acessa o GRR (agentes entram pelo nome) */
export async function responsaveisPossiveis(): Promise<{ id: string; nome: string }[]> {
  const { data } = await criarClienteAdmin().from("usuarios").select("id, nome").eq("ativo", true).in("perfil", ["gestor", "direcao", "supervisor"]).order("nome");
  return (data ?? []).map((u) => ({ id: u.id as string, nome: String(u.nome) }));
}

// ---------------------------------------------------------------------------
// avisos no sino
// ---------------------------------------------------------------------------

export async function avisar(destinatarios: (string | null | undefined)[], aviso: { titulo: string; descricao: string; link: string }, exceto?: string) {
  const ids = [...new Set(destinatarios.filter((x): x is string => !!x && x !== exceto))];
  if (!ids.length) return;
  await criarClienteAdmin()
    .from("notificacoes")
    .insert(ids.map((id) => ({ destinatario_id: id, tipo: "grr", titulo: aviso.titulo, descricao: aviso.descricao.slice(0, 280), link: aviso.link })));
}

export async function idsDaDiretoria(): Promise<string[]> {
  const { data } = await criarClienteAdmin().from("usuarios").select("id").eq("ativo", true).in("perfil", ["gestor", "direcao"]);
  return (data ?? []).map((u) => u.id as string);
}

/**
 * Prazos dos planos: avisa o responsável e quem propôs quando o prazo vence
 * amanhã ou já venceu, uma vez por dia. Chamado junto com os lembretes do
 * CRM (polling do sino); a marca do dia é gravada antes de avisar para duas
 * chamadas simultâneas não avisarem duas vezes.
 */
export async function despacharPrazosGrr(): Promise<number> {
  const admin = criarClienteAdmin();
  const hoje = hojeSantarem();
  const amanha = somarDias(hoje, 1);
  const { data, error } = await admin
    .from("grr_acoes")
    .select("id, descricao, prazo, situacao, aviso_prazo_em, responsavel_id, criado_por, aprovacao")
    .in("situacao", ["pendente", "em_andamento"])
    .neq("aprovacao", "rejeitado")
    .lte("prazo", amanha)
    .limit(50);
  if (error || !data?.length) return 0;
  let avisados = 0;
  for (const p of data as (Pick<Plano, "id" | "descricao" | "prazo" | "situacao" | "responsavel_id" | "criado_por" | "aprovacao"> & { aviso_prazo_em: string | null })[]) {
    if (!precisaAvisoDePrazo(p, hoje, amanha)) continue;
    let reserva = admin.from("grr_acoes").update({ aviso_prazo_em: hoje }).eq("id", p.id);
    reserva = p.aviso_prazo_em ? reserva.eq("aviso_prazo_em", p.aviso_prazo_em) : reserva.is("aviso_prazo_em", null);
    const { data: reservado } = await reserva.select("id");
    if (!reservado?.length) continue;
    const venceu = p.prazo! < hoje;
    await avisar([p.responsavel_id, p.criado_por], {
      titulo: venceu ? "⚠️ Plano de ação atrasado" : "⏳ Plano de ação vence amanhã",
      descricao: p.descricao,
      link: `/grr/planos/${p.id}`,
    });
    avisados++;
  }
  return avisados;
}
