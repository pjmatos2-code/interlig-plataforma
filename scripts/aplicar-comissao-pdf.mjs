import { readFileSync, existsSync } from "node:fs";
import pg from "pg";
for (const a of [".env.local",".env"]) { if(!existsSync(a)) continue;
  for (const l of readFileSync(a,"utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");}}
const APLICAR = process.argv.includes("--aplicar");
const rows = JSON.parse(readFileSync(process.argv[2],"utf8"));
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
await c.connect();
const { rows: pops } = await c.query("select id,nome from pops");
const popId = Object.fromEntries(pops.map(p=>[p.nome,p.id]));

// vendedoras a garantir (nome canônico PDF -> {dbNome, pop})
const NOVAS = [
  { pdf:"Jessica Valentim", db:"Jessica Valentim", pop:"Altamira" },
  { pdf:"Amanda Ribeiro",   db:"Amanda Ribeiro",   pop:"Brasil Novo" },
  { pdf:"Maclicya Martins", db:"Maclicya Martins", pop:"Altamira" },
  { pdf:"Aline Santos",     db:"Aline Santos",     pop:"Brasil Novo" },
  { pdf:"Loja Vtx",         db:"Loja VTX",         pop:"Vitória do Xingu" },
];
if (APLICAR) {
  for (const v of NOVAS) {
    await c.query(
      `insert into vendedores (nome, pop_id, ativo) values ($1,$2,true)
       on conflict do nothing`, [v.db, popId[v.pop]]);
  }
}
const { rows: vs } = await c.query("select id,nome from vendedores");
const idPorNome = Object.fromEntries(vs.map(v=>[v.nome, v.id]));
// PDF canônico -> db nome
const MAP = {
  "Karoline Moraes":"Karoline","Dâmely Costa":"Damely","Andréa Sousa":"Andrea",
  "Janaina Gotardo":"Janaína","Tamiris Linhares":"Tamiris","Ivanilda Costa":"Ivanilda VTX",
  "Jessica Valentim":"Jessica Valentim","Amanda Ribeiro":"Amanda Ribeiro",
  "Maclicya Martins":"Maclicya Martins","Aline Santos":"Aline Santos","Loja Vtx":"Loja VTX",
  "Sem Vendedor":null,
};
let atrib=0, semMatch=0, faltaContrato=0, semVend=0;
const naoMapeados = new Set();
for (const r of rows) {
  const dbNome = MAP[r.vendedor];
  if (dbNome === undefined) { naoMapeados.add(r.vendedor); continue; }
  if (dbNome === null) { semVend++; continue; }
  const vid = idPorNome[dbNome];
  if (!vid) { semMatch++; continue; }
  if (APLICAR) {
    const res = await c.query(
      "update contratos set vendedor_id=$1 where sgp_contrato_id=$2", [vid, String(r.contrato)]);
    if (res.rowCount===0) faltaContrato++; else atrib++;
  } else {
    const res = await c.query("select 1 from contratos where sgp_contrato_id=$1",[String(r.contrato)]);
    if (res.rowCount===0) faltaContrato++; else atrib++;
  }
}
console.log(APLICAR ? "=== APLICADO ===" : "=== SIMULAÇÃO (use --aplicar) ===");
console.log("Contratos atribuídos:", atrib);
console.log("Sem vendedor (mantidos null):", semVend);
console.log("Contrato não existe no banco:", faltaContrato);
console.log("Vendedor sem match:", semMatch, [...naoMapeados]);
await c.end();
