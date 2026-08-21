#!/usr/bin/env node
/**
 * Carga inicial dos dados REAIS do SGP — ver docs/decisoes.md D3.
 * Varredura paginada de /api/ura/clientes/ (contratos+títulos embutidos),
 * filtro dos POPs Altamira / Vitória do Xingu / Brasil Novo, gravação em
 * LOTES e enriquecimento das datas de cancelamento recentes.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await supa.from("integracoes_config").select("config").eq("sistema", "sgp").single();
const { token, app } = cfgRow.config;
const BASE = "https://atm-erp.interlig.net";

const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();

const post = async (rota, extra = {}, tentativas = 3) => {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(BASE + rota, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, app, ...extra }),
        signal: AbortSignal.timeout(45000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tentativas - 1) throw e;
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
};

const semAcento = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const CIDADES = new Map([
  ["ALTAMIRA", "Altamira"],
  ["VITORIA DO XINGU", "Vitória do Xingu"],
  ["BRASIL NOVO", "Brasil Novo"],
]);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dataBr = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const iso = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
};

// ------------------------------------------------------------------ 1. scan
console.log("1) Varrendo clientes do SGP…");
const LIMIT = 100;
let offset = 0, total = Infinity;
const clientes = [];
while (offset < total) {
  const pagina = await post("/api/ura/clientes/", { limit: LIMIT, offset });
  total = pagina.paginacao.total;
  clientes.push(...pagina.clientes);
  offset += LIMIT;
  process.stdout.write(`\r   ${Math.min(offset, total)}/${total}`);
}
const noEscopo = clientes.filter((c) => CIDADES.has(semAcento(c?.endereco?.cidade)));
console.log(`\n   ${clientes.length} clientes na instância · ${noEscopo.length} nos 3 POPs do escopo.`);

// ------------------------------------------------------------- 2. POPs reais
const popIdPorCidade = new Map();
for (const nome of CIDADES.values()) {
  const { rows } = await pgc.query(
    `insert into pops (nome, cidade) values ($1,$1)
     on conflict (nome) do update set cidade=excluded.cidade returning id`, [nome]);
  popIdPorCidade.set(nome, rows[0].id);
}
console.log("2) POPs garantidos:", [...popIdPorCidade.keys()].join(", "));

// ------------------------------------------------- 3. limpar dados fictícios
console.log("3) Removendo dados de demonstração…");
await pgc.query("alter table tickets disable trigger tickets_sem_delete");
await pgc.query("alter table ticket_eventos disable trigger eventos_sem_delete");
await pgc.query("delete from ticket_eventos");
await pgc.query("delete from tickets");
await pgc.query("alter table tickets enable trigger tickets_sem_delete");
await pgc.query("alter table ticket_eventos enable trigger eventos_sem_delete");
await pgc.query("delete from comissoes_fechadas");
await pgc.query("delete from titulos");
await pgc.query("delete from contratos");
await pgc.query("delete from clientes");

// ----------------------------------------------------- 4. montar em memória
console.log("4) Normalizando…");
const planos = new Map();      // sgp_plano_id -> nome
const linhasClientes = [];     // [sgp_id, nome, cpf, tel, bairro, cidade, lat, lng]
const linhasContratos = [];    // [sgp_id, sgp_cliente_id, sgp_plano_id, cidade, mensalidade, status, venda, cancel, motivo]
const linhasTitulos = [];      // [sgp_id, sgp_contrato_id, parcela, valor, venc, pgto, status]
const cancelRecentes = [];
const corte = new Date(Date.now() - 430 * 86400000).toISOString().slice(0, 10);

for (const c of noEscopo) {
  const cidade = CIDADES.get(semAcento(c.endereco.cidade));
  linhasClientes.push([
    String(c.id), c.nome ?? "—", c.cpfcnpj ?? null,
    c?.contatos?.celulares?.[0] ?? c?.contatos?.telefones?.[0] ?? null,
    c?.endereco?.bairro ?? null, cidade,
    parseFloat(c?.endereco?.latitude) || null, parseFloat(c?.endereco?.longitude) || null,
  ]);

  const titulosPorContrato = new Map();
  for (const t of c.titulos ?? []) {
    const k = String(t.clientecontrato_id);
    if (!titulosPorContrato.has(k)) titulosPorContrato.set(k, []);
    titulosPorContrato.get(k).push(t);
  }

  for (const ct of c.contratos ?? []) {
    const dataVenda = dataBr(ct.dataCadastro);
    if (!dataVenda) continue;
    const st = semAcento(ct.status);
    const status =
      st.includes("CANCEL") ? "cancelado"
      : st.includes("SUSPEN") ? "suspenso"
      : st.includes("ATIVO") || st.includes("LIBERADO") ? "ativo"
      : "aguardando_ativacao";

    const servico = (ct.servicos ?? []).find((s) => s.tipo !== "tv") ?? (ct.servicos ?? [])[0];
    const planoId = servico?.plano?.id ? String(servico.plano.id) : null;
    if (planoId && !planos.has(planoId)) planos.set(planoId, servico.plano.descricao ?? `Plano ${planoId}`);

    const doContrato = (titulosPorContrato.get(String(ct.id)) ?? []);
    const naoCancelados = doContrato
      .filter((t) => t.status !== "cancelado")
      .sort((a, b) => ((dataBr(a.dataVencimento) ?? "") < (dataBr(b.dataVencimento) ?? "") ? 1 : -1));
    const mensalidade = num(naoCancelados[0]?.valor);

    const ehCancelado = status === "cancelado";
    linhasContratos.push([
      String(ct.id), String(c.id), planoId, cidade, mensalidade, status, dataVenda,
      ehCancelado ? dataVenda : null, ehCancelado ? (ct.motivo_status || null) : null,
    ]);
    if (ehCancelado && dataVenda >= corte) cancelRecentes.push(String(ct.id));

    const ordenados = doContrato
      .filter((t) => dataBr(t.dataVencimento))
      .sort((a, b) => (dataBr(a.dataVencimento) < dataBr(b.dataVencimento) ? -1 : 1));
    ordenados.forEach((t, i) => {
      linhasTitulos.push([
        String(t.id), String(ct.id), i + 1, num(t.valorCorrigido ?? t.valor),
        dataBr(t.dataVencimento), dataBr(t.dataPagamento),
        t.status === "pago" ? "liquidado" : t.status === "cancelado" ? "cancelado" : "aberto",
      ]);
    });
  }
}
console.log(`   ${linhasClientes.length} clientes · ${linhasContratos.length} contratos · ${linhasTitulos.length} títulos · ${planos.size} planos`);

// -------------------------------------------------------------- 5. gravação
console.log("5) Gravando em lotes…");
for (const [sgpId, nome] of planos) {
  await pgc.query(
    `insert into planos (sgp_plano_id, nome, ativo) values ($1,$2,true)
     on conflict (sgp_plano_id) do update set nome=$2`, [sgpId, nome]);
}

const LOTE = 1000;
for (let i = 0; i < linhasClientes.length; i += LOTE) {
  const b = linhasClientes.slice(i, i + LOTE);
  await pgc.query(
    `insert into clientes (sgp_cliente_id, nome, cpf, telefone, bairro, cidade, lat, lng, sync_updated_at)
     select *, now() from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::float8[],$8::float8[])
     on conflict (sgp_cliente_id) do nothing`,
    [0,1,2,3,4,5,6,7].map((k) => b.map((r) => r[k]))
  );
  process.stdout.write(`\r   clientes ${Math.min(i + LOTE, linhasClientes.length)}/${linhasClientes.length}`);
}
console.log();

for (let i = 0; i < linhasContratos.length; i += LOTE) {
  const b = linhasContratos.slice(i, i + LOTE);
  await pgc.query(
    `insert into contratos (sgp_contrato_id, cliente_id, plano_id, pop_id, valor_mensalidade,
        status, data_venda, data_assinatura, data_ativacao, data_cancelamento, motivo_cancelamento, sync_updated_at)
     select v.sgp_id, cl.id, pl.id, po.id, v.mensal, v.status::status_contrato,
            v.venda::date, v.venda::date, v.venda::date, v.cancel::date, v.motivo, now()
     from unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::numeric[],$6::text[],$7::text[],$8::text[],$9::text[])
          as v(sgp_id, sgp_cliente, sgp_plano, cidade, mensal, status, venda, cancel, motivo)
     join clientes cl on cl.sgp_cliente_id = v.sgp_cliente
     left join planos pl on pl.sgp_plano_id = v.sgp_plano
     join pops po on po.cidade = v.cidade
     on conflict (sgp_contrato_id) do nothing`,
    [0,1,2,3,4,5,6,7,8].map((k) => b.map((r) => r[k]))
  );
  process.stdout.write(`\r   contratos ${Math.min(i + LOTE, linhasContratos.length)}/${linhasContratos.length}`);
}
console.log();

for (let i = 0; i < linhasTitulos.length; i += 2000) {
  const b = linhasTitulos.slice(i, i + 2000);
  await pgc.query(
    `insert into titulos (sgp_titulo_id, contrato_id, numero_parcela, valor, vencimento, data_pagamento, status, sync_updated_at)
     select v.sgp_id, ct.id, v.parcela, v.valor, v.venc::date, v.pgto::date, v.status::status_titulo, now()
     from unnest($1::text[],$2::text[],$3::int[],$4::numeric[],$5::text[],$6::text[],$7::text[])
          as v(sgp_id, sgp_contrato, parcela, valor, venc, pgto, status)
     join contratos ct on ct.sgp_contrato_id = v.sgp_contrato
     on conflict (sgp_titulo_id) do nothing`,
    [0,1,2,3,4,5,6].map((k) => b.map((r) => r[k]))
  );
  process.stdout.write(`\r   títulos ${Math.min(i + 2000, linhasTitulos.length)}/${linhasTitulos.length}`);
}
console.log();

// ------------------------------------- 6. datas reais de cancelamento (cap)
const MAX_DETALHES = 600;
const alvo = cancelRecentes.slice(0, MAX_DETALHES);
console.log(`6) Datas de cancelamento reais (${alvo.length} de ${cancelRecentes.length} cancelados recentes)…`);
let enriquecidos = 0;
for (const sgpId of alvo) {
  try {
    const detalhe = await post("/api/ura/consultacliente/", { contrato: Number(sgpId) });
    const contrato = (detalhe.contratos ?? []).find((x) => String(x.contratoId) === sgpId) ?? (detalhe.contratos ?? [])[0];
    const dataAlt = dataBr(contrato?.dataAlteracao);
    if (dataAlt) {
      await pgc.query(
        `update contratos set data_cancelamento = greatest(data_venda, $1::date)
         where sgp_contrato_id = $2`, [dataAlt, sgpId]);
      enriquecidos += 1;
    }
  } catch { /* mantém aproximação */ }
  if (enriquecidos % 25 === 0) process.stdout.write(`\r   ${enriquecidos}/${alvo.length}`);
}
console.log(`\n   ${enriquecidos} datas reais aplicadas.`);

// --------------------------------------------------------------- 7. sync log
const contagens = await pgc.query(`
  select
    (select count(*) from clientes)::int as clientes,
    (select count(*) from contratos)::int as contratos,
    (select count(*) from contratos where status='ativo')::int as ativos,
    (select count(*) from contratos where status='cancelado')::int as cancelados,
    (select count(*) from contratos where status='suspenso')::int as suspensos,
    (select count(*) from titulos)::int as titulos,
    (select count(*) from planos)::int as planos`);
for (const [entidade, registros] of [
  ["clientes", contagens.rows[0].clientes],
  ["contratos", contagens.rows[0].contratos],
  ["titulos", contagens.rows[0].titulos],
  ["planos", contagens.rows[0].planos],
]) {
  await pgc.query(
    `insert into sync_runs (entidade, finalizado_em, registros, status) values ($1, now(), $2, 'sucesso')`,
    [entidade, registros]);
}
console.log("\n===== CARGA CONCLUÍDA =====");
console.table(contagens.rows);
await pgc.end();
