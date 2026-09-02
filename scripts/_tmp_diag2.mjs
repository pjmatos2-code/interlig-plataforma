import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// último contrato importado e última sync
const { data: ult } = await s.from("contratos").select("data_venda, criado_em, cliente_id").order("criado_em", { ascending: false }).limit(5);
console.log("últimos contratos importados (criado_em / data_venda):");
for (const c of ult) console.log(" -", c.criado_em, "| venda:", c.data_venda);
const { data: sync } = await s.from("sync_estado").select("*").limit(5).catch?.(() => ({ data: null })) ?? {};
if (sync) console.log("sync_estado:", JSON.stringify(sync));

// tickets sgp_auto de hoje
const { data: hoje } = await s.from("tickets").select("id, origem_criacao, criado_em").gte("criado_em", "2026-09-02").order("criado_em");
console.log(`tickets criados hoje 02/09: ${hoje.length}`, JSON.stringify(hoje.map(t => `${t.criado_em.slice(11,16)} ${t.origem_criacao}`)));

// Karoline: os 7 fechados em setembro — data da venda dos contratos vinculados
const { data: tk } = await s.from("tickets").select("id, contrato_id, fechado_em, origem_criacao, contratos(data_venda)").eq("vendedor_id", "9ebb565f-0000-0000-0000-000000000000".slice(0,8) === "9ebb565f" ? (await s.from("vendedores").select("id").ilike("nome", "%karoline%")).data[0].id : null).eq("etapa", "fechado").eq("desfecho", "convertido").gte("fechado_em", "2026-09-01");
console.log(`\nKaroline fechados convertidos em setembro: ${tk.length}`);
for (const t of tk) console.log(" - fechado:", t.fechado_em?.slice(0,16), "| venda do contrato:", t.contratos?.data_venda, "| origem:", t.origem_criacao);
