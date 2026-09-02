import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query("select column_name, is_nullable from information_schema.columns where table_name='visitas_externas' order by ordinal_position");
console.log(rows.map(r => `${r.column_name}${r.is_nullable === "NO" ? "*" : ""}`).join(", "));
await c.end();
