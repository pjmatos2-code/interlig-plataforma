import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await s.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config;
const base = cfg.base_url.replace(/\/admin\/?$/, "");
async function pagina(offset, limit = 100) {
  const r = await fetch(`${base}/api/ura/clientes/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: cfg.token, app: cfg.app, limit, offset }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) { console.log("HTTP", r.status); process.exit(1); }
  return r.json();
}
const p0 = await pagina(0, 5);
const total = p0.paginacao.total;
console.log("total na URA:", total);
console.log("primeiros ids:", (p0.clientes ?? []).map(c => c.id).join(", "));
const fim = await pagina(Math.max(0, total - 12), 12);
console.log("últimos clientes:");
for (const c of fim.clientes ?? []) {
  const cts = (c.contratos ?? []).map(ct => `ct${ct.id}@${ct.dataCadastro}`).join(",");
  console.log(` ${c.id} ${String(c.nome).slice(0,24)} | ${c.endereco?.cidade} | ${cts}`);
}
