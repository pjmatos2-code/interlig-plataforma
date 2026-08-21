#!/usr/bin/env node
/** Aplica datas/motivos reais de cancelamento (JSON do importar-cancelados.py). */
import { readFileSync } from "node:fs";
import pg from "pg";
for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const dados = JSON.parse(readFileSync(process.argv[2] ?? "/tmp/cancelados.json", "utf8"));
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();
const { rowCount } = await pgc.query(
  `update contratos ct set
     data_cancelamento = greatest(ct.data_venda, v.data::date),
     motivo_cancelamento = coalesce(v.motivo, ct.motivo_cancelamento),
     sync_updated_at = now()
   from jsonb_to_recordset($1::jsonb) as v(contrato text, data text, motivo text)
   where ct.sgp_contrato_id = v.contrato and ct.status = 'cancelado'`,
  [JSON.stringify(dados)]
);
console.log(`contratos atualizados com data real de cancelamento: ${rowCount}`);
const { rows: [r] } = await pgc.query(`
  select count(*) filter (where data_cancelamento <> data_venda)::int as com_data_real,
         count(*)::int as cancelados_total
  from contratos where status = 'cancelado'`);
console.log(r);
await pgc.end();
