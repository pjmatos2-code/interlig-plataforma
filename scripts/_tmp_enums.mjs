import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
for (const t of ["origem_criacao_ticket", "fechado_por_ticket", "desfecho_ticket"]) {
  const { rows } = await c.query("select enumlabel from pg_enum e join pg_type ty on ty.oid=e.enumtypid where ty.typname=$1 order by enumsortorder", [t]);
  console.log(t + ":", rows.map(r => r.enumlabel).join(", ") || "(nao e enum)");
}
const { rows: cols } = await c.query("select column_name, data_type, udt_name from information_schema.columns where table_name='tickets' and column_name in ('origem_criacao','fechado_por')");
console.log(JSON.stringify(cols));
await c.end();
