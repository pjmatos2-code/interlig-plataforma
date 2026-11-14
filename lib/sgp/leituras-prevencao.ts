import "server-only";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { somarDias } from "@/lib/datas";
import {
  cursorOcorrencias,
  janelaCancelamentosRecentes,
  relogioSantarem,
  trechoOcorrencias,
} from "@/lib/sync/agenda";

/**
 * Leituras do SGP que alimentam a Prevenção de cancelamento (14/11/2026):
 * ocorrências (Insatisfação, Pedidos de cancelamento, promessa de pagamento no
 * Débito) e cancelamentos (Motivos). A rotina automática (/api/sync/rotinas) e
 * o botão "Atualizar agora" da tela passam por aqui. Os dois usam o mesmo
 * cursor e a mesma trava, para não repetir nem atropelar a leitura do outro.
 *
 * Tudo o que sai daqui para a tela são datas. A configuração do SGP tem
 * credenciais e nunca deixa o servidor.
 */

type Admin = ReturnType<typeof criarClienteAdmin>;

/** Um trecho leva 10–30 s; passou disso, a trava é de uma leitura que morreu no meio. */
const TRAVA_MS = 200_000;
/** Duas pessoas clicando em seguida: a segunda não refaz o que acabou de ser lido. */
const RECENTE_MS = 3 * 60_000;

export type EstadoLeituras = {
  /** dia de hoje em Santarém (aaaa-mm-dd) */
  hoje: string;
  /** primeiro dia de ocorrências ainda por ler; igual a `hoje` = em dia */
  ocorrenciasCursor: string;
  ocorrenciasLidasEm: string | null;
  cancelamentosLidosEm: string | null;
  /** leitura de ocorrências em andamento (rotina ou botão), se houver */
  lendoDesde: string | null;
};

async function ultimoSucesso(admin: Admin, entidade: string): Promise<string | null> {
  const { data } = await admin
    .from("sync_runs")
    .select("finalizado_em")
    .eq("entidade", entidade)
    .eq("status", "sucesso")
    .order("finalizado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.finalizado_em as string | undefined) ?? null;
}

async function configSgp(admin: Admin): Promise<Record<string, unknown>> {
  const { data } = await admin.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
  return (data?.config ?? {}) as Record<string, unknown>;
}

async function marcar(admin: Admin, patch: Record<string, unknown>) {
  const { error } = await admin.rpc("mesclar_config", { p_sistema: "sgp", p_patch: patch });
  if (error) console.error("marcador das leituras da prevenção:", error.message);
}

async function registrar(
  admin: Admin,
  entidade: string,
  inicio: number,
  r: { ok: boolean; registros: number; erro: string | null }
) {
  const { error } = await admin.from("sync_runs").insert({
    entidade,
    iniciado_em: new Date(inicio).toISOString(),
    finalizado_em: new Date().toISOString(),
    registros: r.registros,
    status: r.ok ? "sucesso" : "erro",
    erro: r.erro,
  });
  if (error) console.error(`log ${entidade}:`, error.message);
}

export async function estadoLeituras(admin: Admin = criarClienteAdmin(), agora = Date.now()): Promise<EstadoLeituras> {
  const [cfg, ocorrencias, cancelamentos] = await Promise.all([
    configSgp(admin),
    ultimoSucesso(admin, "ocorrencias"),
    ultimoSucesso(admin, "cancelamentos"),
  ]);
  const lendo = typeof cfg.ocorrencias_em_leitura_desde === "string" ? cfg.ocorrencias_em_leitura_desde : null;
  return {
    hoje: relogioSantarem(agora).dia,
    ocorrenciasCursor: cursorOcorrencias(agora, cfg.ocorrencias_cursor as string | undefined, ocorrencias),
    ocorrenciasLidasEm: ocorrencias,
    cancelamentosLidosEm: cancelamentos,
    lendoDesde: lendo && agora - Date.parse(lendo) < TRAVA_MS ? lendo : null,
  };
}

export type ResultadoTrecho =
  | { ok: true; pulou: boolean; de: string; ate: string; lidas: number; chegouHoje: boolean }
  | { ok: false; ocupado: boolean; erro: string };

/**
 * Lê UM trecho de ocorrências a partir do cursor: os últimos 3 dias quando em
 * dia, ou até 7 dias quando atrasada. O cursor só anda com leitura boa e nunca
 * volta. `ate` na resposta é o último dia lido (inclusive).
 */
export async function lerTrechoOcorrencias(
  admin: Admin = criarClienteAdmin(),
  agora = Date.now()
): Promise<ResultadoTrecho> {
  const estado = await estadoLeituras(admin, agora);
  if (estado.lendoDesde) return { ok: false, ocupado: true, erro: "já tem uma leitura de ocorrências em andamento" };
  const t = trechoOcorrencias(agora, estado.ocorrenciasCursor);
  if (
    t.chegaHoje &&
    estado.ocorrenciasCursor === estado.hoje &&
    estado.ocorrenciasLidasEm &&
    agora - Date.parse(estado.ocorrenciasLidasEm) < RECENTE_MS
  ) {
    return { ok: true, pulou: true, de: t.de, ate: estado.hoje, lidas: 0, chegouHoje: true };
  }

  await marcar(admin, { ocorrencias_em_leitura_desde: new Date(agora).toISOString() });
  const inicio = Date.now();
  let r: { ok: boolean; lidas: number; erro?: string };
  try {
    const { atualizarOcorrencias } = await import("@/lib/sgp/ocorrencias");
    r = await atualizarOcorrencias(t.de, t.ateExclusivo);
  } catch (e) {
    r = { ok: false, lidas: 0, erro: String(e) };
  }
  const patch: Record<string, unknown> = { ocorrencias_em_leitura_desde: null };
  if (r.ok) {
    // relido agora: outra leitura pode ter levado o cursor mais à frente
    const atual = (await configSgp(admin)).ocorrencias_cursor;
    patch.ocorrencias_cursor =
      typeof atual === "string" && atual > t.cursorDepois && atual <= estado.hoje ? atual : t.cursorDepois;
  }
  await marcar(admin, patch);
  await registrar(admin, "ocorrencias", inicio, { ok: r.ok, registros: r.lidas, erro: r.ok ? null : r.erro ?? "falhou" });
  if (!r.ok) return { ok: false, ocupado: false, erro: r.erro ?? "falhou" };
  return { ok: true, pulou: false, de: t.de, ate: somarDias(t.ateExclusivo, -1), lidas: r.lidas, chegouHoje: t.chegaHoje };
}

export type ResultadoCancelamentos =
  | { ok: true; pulou: boolean; de: string; ate: string; lidos: number; corrigidos: number }
  | { ok: false; erro: string };

/**
 * Cancelamentos recentes, para o botão. A rotina de 6 h continua relendo o mês
 * anterior inteiro. Isso corrige data e motivo que o SGP muda depois.
 */
export async function lerCancelamentosRecentes(
  admin: Admin = criarClienteAdmin(),
  agora = Date.now()
): Promise<ResultadoCancelamentos> {
  const ultimo = await ultimoSucesso(admin, "cancelamentos");
  const { de, ate } = janelaCancelamentosRecentes(agora, ultimo);
  if (ultimo && agora - Date.parse(ultimo) < RECENTE_MS) {
    return { ok: true, pulou: true, de, ate, lidos: 0, corrigidos: 0 };
  }
  const inicio = Date.now();
  let r: { ok: boolean; lidos: number; corrigidos: number; erro?: string };
  try {
    const { atualizarCancelamentos } = await import("@/lib/sgp/cancelados");
    r = await atualizarCancelamentos(de, ate);
  } catch (e) {
    r = { ok: false, lidos: 0, corrigidos: 0, erro: String(e) };
  }
  await registrar(admin, "cancelamentos", inicio, {
    ok: r.ok,
    registros: r.corrigidos,
    erro: r.ok ? null : r.erro ?? "falhou",
  });
  if (!r.ok) return { ok: false, erro: r.erro ?? "falhou" };
  return { ok: true, pulou: false, de, ate, lidos: r.lidos, corrigidos: r.corrigidos };
}
