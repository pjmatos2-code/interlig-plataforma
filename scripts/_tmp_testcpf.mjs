import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfgRow } = await s.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = cfgRow.config;
const base = cfg.base_url.replace(/\/admin\/?$/, "");
const { data: um } = await s.from("clientes").select("cpf, nome").not("cpf", "is", null).limit(1);
console.log("testando filtro cpfcnpj com:", um[0].nome);
const r = await fetch(`${base}/api/ura/clientes/`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: cfg.token, app: cfg.app, cpfcnpj: um[0].cpf }),
  signal: AbortSignal.timeout(45000),
});
const j = await r.json();
console.log("status:", r.status, "| total:", j?.paginacao?.total, "| clientes:", (j?.clientes ?? []).map(c => c.nome?.slice(0,20)).join(", "));
