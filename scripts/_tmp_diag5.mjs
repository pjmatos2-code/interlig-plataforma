import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const q = async (tabela, col) => {
  const { data, error } = await s.from(tabela).select(col).gte(col, "2026-08-28").order(col, { ascending: false }).limit(500);
  if (error) { console.log(`${tabela} err:`, error.message); return []; }
  return data;
};
const cli = await q("clientes", "criado_em");
const porDiaCli = {};
for (const c of cli) { const d = c.criado_em.slice(0,10); porDiaCli[d] = (porDiaCli[d] ?? 0) + 1; }
console.log("clientes NOVOS por dia:", JSON.stringify(porDiaCli), "| último:", cli[0]?.criado_em);

const ct = await q("contratos", "criado_em");
const porDiaCt = {};
for (const c of ct) { const d = c.criado_em.slice(0,10); porDiaCt[d] = (porDiaCt[d] ?? 0) + 1; }
console.log("contratos NOVOS por dia:", JSON.stringify(porDiaCt));

const { data: runs, error: er } = await s.from("sync_runs").select("iniciado_em, registros, status, erro").eq("entidade", "clientes").gte("iniciado_em", "2026-09-01T12:00:00Z").order("iniciado_em", { ascending: false }).limit(80);
if (er) console.log("runs err:", er.message);
else {
  console.log(`runs 'clientes' desde 01/09 12h UTC: ${runs.length}`);
  console.log(runs.map(r => `${r.iniciado_em.slice(5,16)}=${r.registros}${r.status !== "sucesso" ? "!" : ""}`).join(" "));
}
