import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("alter type origem_criacao_ticket add value if not exists 'sgp_auto'");
const { rows } = await c.query("select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='origem_criacao_ticket' order by enumsortorder");
console.log("origens:", rows.map(r => r.enumlabel).join(", "));
await c.end();
