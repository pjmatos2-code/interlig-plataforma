import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
for (const a of [".env.local",".env"]) { if(!existsSync(a)) continue;
  for (const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const rows = JSON.parse(readFileSync(process.argv[2],"utf8"));
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await c.connect();
const ids = rows.map(r=>String(r.contrato));
const { rows: dbc } = await c.query(
  `select sgp_contrato_id, id, vendedor_id, pop_id, status, valor_mensalidade from contratos where sgp_contrato_id = any($1)`, [ids]);
const byId = new Map(dbc.map(x=>[String(x.sgp_contrato_id), x]));
const { rows: pops } = await c.query(`select id, nome from pops`);
const popNome = new Map(pops.map(p=>[p.id,p.nome]));
let achados=0, faltando=[];
const popPorVend = {};
for (const r of rows){
  const d = byId.get(String(r.contrato));
  if(!d){ faltando.push(r.contrato); continue; }
  achados++;
  const pv = popNome.get(d.pop_id) ?? "?";
  popPorVend[r.vendedor] = popPorVend[r.vendedor] || {};
  popPorVend[r.vendedor][pv] = (popPorVend[r.vendedor][pv]||0)+1;
}
console.log("Contratos do PDF encontrados no banco:", achados, "/", rows.length);
console.log("Faltando no banco:", faltando.length, faltando.slice(0,30));
console.log("\nPOP por vendedor (dos contratos no banco):");
for (const [v,dist] of Object.entries(popPorVend)) console.log(" ", v, dist);
await c.end();
