import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("alter table tickets add column if not exists email text");
const { rows } = await c.query("select column_name from information_schema.columns where table_name='clientes' and column_name ilike '%mail%'");
console.log("tickets.email ok | clientes tem email?", JSON.stringify(rows));
await c.end();
