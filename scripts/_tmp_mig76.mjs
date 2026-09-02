import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const pg = await import("pg");
const c = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query("alter table visitas_externas alter column foto_casa_path drop not null");
await c.query("alter table visitas_externas add column if not exists endereco_manual text");
console.log("migração 0076 aplicada");
await c.end();
