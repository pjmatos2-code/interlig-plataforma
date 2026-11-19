#!/usr/bin/env node
/**
 * Conferência das permissões do GRR por perfil (Etapa 5). SÓ LEITURA: tudo
 * roda numa transação desfeita no final (rollback); as tentativas de gravar
 * existem só para confirmar que o banco recusa, e também são desfeitas.
 *
 *   node --env-file=.env.local scripts/grr/conferir-permissoes.mjs
 *
 * Escolhe no banco um usuário ativo de cada perfil (administração, direção,
 * coordenação com equipe, coordenação sem equipe e agente) e confere, em
 * todas as visões do GRR, o que cada um enxerga e o que consegue gravar.
 * Coordenação com ou sem equipe segue a regra do banco (app.coordena_time):
 * quem apoia uma equipe conta como coordenação com equipe.
 * Não imprime nome nem dado de ninguém: só contagens.
 */
import pg from "pg";

const VISOES = ["grr_indicadores", "grr_metas", "grr_fotos", "grr_reunioes", "grr_compromissos", "grr_reuniao_registros", "grr_diagnosticos", "grr_acoes", "grr_acao_eventos"];
const COM_RECORTE = ["grr_fotos", "grr_diagnosticos", "grr_acoes", "grr_reunioes"];

function urlPooler(url, host) {
  const u = new URL(url);
  u.username = `postgres.${u.hostname.split(".")[1]}`;
  u.hostname = host;
  u.port = "5432";
  return u.toString();
}
async function conectar() {
  const direta = process.env.DATABASE_URL;
  if (!direta) throw new Error("DATABASE_URL não definida.");
  for (const url of [direta, urlPooler(direta, "aws-1-us-east-1.pooler.supabase.com"), urlPooler(direta, "aws-0-us-east-1.pooler.supabase.com")]) {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 12000 });
    try {
      await c.connect();
      return c;
    } catch {
      /* próxima rota */
    }
  }
  throw new Error("sem conexão com o banco");
}

const db = await conectar();
let ok = 0;
let falhas = 0;
const confere = (nome, condicao, detalhe = "") => {
  condicao ? ok++ : falhas++;
  console.log(`  ${condicao ? "✓" : "✗ FALHOU"} ${nome}${detalhe ? ` · ${detalhe}` : ""}`);
};
const como = async (id) => {
  await db.query("reset role");
  if (!id) return;
  await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true)", [JSON.stringify({ sub: id, role: "authenticated" }), id]);
  await db.query("set local role authenticated");
};
const tenta = async (sql, params = []) => {
  await db.query("savepoint t");
  try {
    const r = await db.query(sql, params);
    await db.query("release savepoint t");
    return { linhas: r.rows, n: r.rowCount, erro: null };
  } catch (e) {
    await db.query("rollback to savepoint t");
    return { linhas: [], n: 0, erro: e.message };
  }
};
const contar = async (visao) => (await tenta(`select count(*)::int n from public.${visao}`)).linhas[0]?.n ?? -1;

try {
  await db.query("begin read write");
  await db.query("set local statement_timeout = '30s'");

  // um usuário de cada perfil (o primeiro ativo; só o id é usado)
  const um = async (sql) => (await db.query(sql)).rows[0]?.id ?? null;
  const gestor = await um("select id from public.usuarios where ativo and perfil = 'gestor' order by criado_em limit 1");
  const direcao = await um("select id from public.usuarios where ativo and perfil = 'direcao' order by criado_em limit 1");
  // coordenação com ou sem equipe pela mesma regra do banco (app.coordena_time: equipe direta ou de apoio)
  let comEquipe = null;
  let semEquipe = null;
  for (const { id } of (await db.query("select id from public.usuarios where ativo and perfil = 'supervisor' and pop_id is not null order by criado_em")).rows) {
    await como(id);
    const coordena = (await db.query("select app.coordena_time() as c")).rows[0].c;
    if (coordena && !comEquipe) comEquipe = id;
    if (!coordena && !semEquipe) semEquipe = id;
  }
  await como(null);
  const agente = await um("select id from public.usuarios where ativo and perfil = 'vendedora' order by criado_em limit 1");

  await como(null);
  const total = {};
  for (const v of VISOES) total[v] = await contar(v);
  console.log("Registros no banco por visão:", Object.entries(total).map(([v, n]) => `${v.replace("grr_", "")} ${n}`).join(" · "));

  console.log("\n1. Sem login (anon)");
  await db.query("set local role anon");
  for (const v of VISOES) confere(`${v}: sem acesso`, !!(await tenta(`select 1 from public.${v} limit 1`)).erro);
  await db.query("reset role");

  for (const [rotulo, id] of [["Administração", gestor], ["Direção", direcao]]) {
    console.log(`\n2. ${rotulo}: vê tudo`);
    if (!id) { console.log("  (nenhum usuário com esse perfil)"); continue; }
    await como(id);
    for (const v of VISOES) {
      const n = await contar(v);
      confere(`${v}: ${n} de ${total[v]}`, n === total[v]);
    }
  }
  await como(direcao);
  if (direcao) confere("direção não cria meta (só a administração)", !!(await tenta("insert into public.grr_metas (indicador, escopo_tipo, vigente_desde, meta, limite_atencao) values ('conversao', 'empresa', '2026-11-16', 0.5, 0.4)")).erro);

  console.log("\n3. Coordenação com equipe: só a equipe e os agentes dela");
  if (comEquipe) {
    await como(comEquipe);
    const fora = async (v) =>
      (await tenta(
        `select count(*)::int n from public.${v} x where not (
           (x.escopo_tipo = 'equipe' and x.escopo_ref = $1)
           or (x.escopo_tipo = 'agente' and x.escopo_ref in (select app.vendedores_coordenados())))`,
        [comEquipe]
      )).linhas[0]?.n;
    for (const v of COM_RECORTE) confere(`${v}: nada fora do recorte`, (await fora(v)) === 0);
    confere("não congela semana", !!(await tenta("insert into public.grr_fotos (periodo_tipo, periodo_inicio, periodo_fim, escopo_tipo, escopo_ref, escopo_rotulo, versao, dados) values ('semana', '2026-11-09', '2026-11-15', 'equipe', $1, 't', 99, '{}')", [comEquipe])).erro);
    confere("não cria meta", !!(await tenta("insert into public.grr_metas (indicador, escopo_tipo, vigente_desde, meta, limite_atencao) values ('conversao', 'empresa', '2026-11-16', 0.5, 0.4)")).erro);
    confere("não aprova plano", (await tenta("update public.grr_acoes set aprovacao = 'aprovado' where aprovacao = 'aguardando'")).erro !== null || (await contar("grr_acoes")) === 0);
  } else console.log("  (nenhuma coordenação com equipe)");

  console.log("\n4. Coordenação sem equipe: só a unidade e os agentes dela");
  if (semEquipe) {
    await como(semEquipe);
    for (const v of COM_RECORTE) {
      const n = (await tenta(
        `select count(*)::int n from public.${v} x where not (
           (x.escopo_tipo = 'unidade' and x.escopo_ref = (select app.pop_atual()))
           or (x.escopo_tipo = 'agente' and x.escopo_ref in (select id from public.vendedores where pop_id = (select app.pop_atual()))))`
      )).linhas[0]?.n;
      confere(`${v}: nada fora do recorte`, n === 0);
    }
  } else console.log("  (nenhuma coordenação sem equipe)");

  console.log("\n5. Agente: nada do GRR");
  if (agente) {
    await como(agente);
    for (const v of VISOES) confere(`${v}: 0 linhas`, (await contar(v)) <= 0);
    confere("não registra diagnóstico", !!(await tenta("insert into public.grr_diagnosticos (periodo_inicio, periodo_fim, indicador, escopo_tipo, escopo_ref, escopo_rotulo, causa, criado_por) values ('2026-11-16', '2026-11-22', 'conversao', 'empresa', null, 'x', 'x', $1)", [agente])).erro);
  } else console.log("  (nenhum agente)");
} catch (e) {
  console.log("\nINTERROMPIDO:", e.message);
  falhas++;
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
  console.log(`\n${ok} conferências ok, ${falhas} falhas · transação desfeita, nada gravado.`);
  process.exitCode = falhas ? 1 : 0;
}
