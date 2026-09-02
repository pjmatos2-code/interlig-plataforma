import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const normTel = v => { const d = (v ?? "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : ""; };
const normCpf = v => (v ?? "").replace(/\D/g, "");

const desde = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const [{ data: contratos, error: e1 }, { data: existentes, error: e2 }] = await Promise.all([
  s.from("contratos").select("id, sgp_contrato_id, plano_id, vendedor_id, data_venda, status, clientes(telefone, cpf, nome)").gte("data_venda", desde).neq("status", "cancelado").limit(1000),
  s.from("tickets").select("id, contrato_id, telefone, cpf, origem_criacao, criado_em, etapa").gte("criado_em", new Date(Date.now() - 45 * 86400000).toISOString()).limit(4000),
]);
if (e1 || e2) { console.error(e1?.message, e2?.message); process.exit(1); }
console.log(`contratos desde ${desde}: ${contratos.length} | tickets 45d: ${existentes.length}`);
const porDia = {};
for (const c of contratos) porDia[c.data_venda] = (porDia[c.data_venda] ?? 0) + 1;
console.log("contratos por dia:", JSON.stringify(porDia));
const tkDia = {};
for (const t of existentes) { const k = `${t.criado_em.slice(0,10)}|${t.origem_criacao}`; tkDia[k] = (tkDia[k] ?? 0) + 1; }
console.log("tickets recentes por dia|origem (só >=29/08):", JSON.stringify(Object.fromEntries(Object.entries(tkDia).filter(([k]) => k >= "2026-08-29"))));

const comContrato = new Set(existentes.map(t => t.contrato_id).filter(Boolean));
const chaves = new Set();
for (const t of existentes) { const a = normTel(t.telefone); if (a) chaves.add("t:"+a); const b = normCpf(t.cpf); if (b) chaves.add("c:"+b); }
let semId = 0; const faltando = [];
for (const c of contratos) {
  if (comContrato.has(c.id)) continue;
  const tel = normTel(c.clientes?.telefone), cpf = normCpf(c.clientes?.cpf);
  if (!tel && !cpf) { semId++; continue; }
  if ((tel && chaves.has("t:"+tel)) || (cpf && chaves.has("c:"+cpf))) continue;
  faltando.push(c);
}
console.log(`\ncontratos SEM ticket que a rotina deveria criar: ${faltando.length} (sem tel/cpf: ${semId})`);
for (const c of faltando.slice(0, 20)) console.log(" -", c.data_venda, c.clientes?.nome, "#"+c.sgp_contrato_id, "plano:", c.plano_id ? "sim" : "NÃO", "vend:", (c.vendedor_id ?? "—").slice(0,8));

// Karoline setembro
const { data: vend } = await s.from("vendedores").select("id, nome").ilike("nome", "%karoline%");
const k = vend?.[0];
const { data: vk } = await s.from("contratos").select("id, data_venda, status, plano_id").eq("vendedor_id", k.id).gte("data_venda", "2026-09-01").neq("status", "cancelado");
console.log(`\nKaroline (${k.id.slice(0,8)}) vendas set (não canceladas): ${vk.length}`);
const { data: tk } = await s.from("tickets").select("id, etapa, desfecho, origem_criacao, criado_em, fechado_em, contrato_id").eq("vendedor_id", k.id).gte("criado_em", "2026-08-01");
const fechadosConv = tk.filter(t => t.etapa === "fechado" && t.desfecho === "convertido");
console.log(`Karoline tickets fechados convertidos (ago+set): ${fechadosConv.length}; fechados em setembro: ${fechadosConv.filter(t => (t.fechado_em ?? "").slice(0,10) >= "2026-09-01").length}`);
const vkSemTicket = vk.filter(c => !tk.some(t => t.contrato_id === c.id) && !existentes.some(t => t.contrato_id === c.id));
console.log(`Karoline vendas set SEM ticket vinculado: ${vkSemTicket.length}`);
