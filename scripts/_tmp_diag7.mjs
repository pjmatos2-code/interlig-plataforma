import { readFileSync, writeFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await s.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config;
const base = cfg.base_url.replace(/\/admin\/?$/, "");
async function pagina(offset, limit = 100) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${base}/api/ura/clientes/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: cfg.token, app: cfg.app, limit, offset }),
        signal: AbortSignal.timeout(60000),
      });
      if (r.ok) return r.json();
    } catch {}
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error("falha offset " + offset);
}
// varre tudo
const todos = new Map();
let offset = 0, total = Infinity;
while (offset < total) {
  const p = await pagina(offset);
  total = p.paginacao.total;
  for (const c of p.clientes ?? []) todos.set(String(c.id), c);
  offset += 100;
}
console.log(`URA: ${todos.size} clientes (total declarado ${total})`);

// ids na plataforma
let nossos = new Set(); let from = 0;
for (;;) {
  const { data } = await s.from("clientes").select("sgp_cliente_id").range(from, from + 999);
  for (const c of data ?? []) nossos.add(String(c.sgp_cliente_id));
  if (!data || data.length < 1000) break; from += 1000;
}
console.log(`plataforma: ${nossos.size} clientes`);

const faltam = [...todos.values()].filter(c => !nossos.has(String(c.id)));
console.log(`FALTANDO na plataforma: ${faltam.length}`);
const porAno = {};
for (const c of faltam) for (const ct of c.contratos ?? []) porAno[ct.dataCadastro?.slice(0,7) ?? "?"] = (porAno[ct.dataCadastro?.slice(0,7) ?? "?"] ?? 0) + 1;
console.log("contratos dos faltantes por mês:", JSON.stringify(porAno));
const recentes = faltam.filter(c => (c.contratos ?? []).some(ct => (ct.dataCadastro ?? "") >= "2026-08-25"));
console.log(`faltantes com contrato desde 25/08: ${recentes.length}`);
for (const c of recentes) console.log(" -", c.id, c.nome?.slice(0,30), "|", c.endereco?.cidade, "|", (c.contratos ?? []).map(ct => `${ct.id}@${ct.dataCadastro}`).join(","));
writeFileSync("scripts/_tmp_faltantes.json", JSON.stringify(faltam));
console.log("salvo em scripts/_tmp_faltantes.json");
