import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("alter type etapa_ticket add value if not exists 'pre_cadastro'");
await c.end();
const c2 = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c2.connect();
await c2.query("alter table visitas_externas add column if not exists foto_doc_verso_path text");
await c2.query("alter table tickets add column if not exists vencimento_dia smallint check (vencimento_dia in (7, 14, 21, 28))");
const { rows } = await c2.query("select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='etapa_ticket' order by enumsortorder");
console.log("etapas:", rows.map(r => r.enumlabel).join(", "));
await c2.end();
