import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfg } = await s.from("integracoes_config").select("sistema, config, atualizado_em").eq("sistema", "sgp").maybeSingle();
console.log("config sgp:", JSON.stringify(cfg, null, 1).slice(0, 800));
const { data: runs, error } = await s.from("sync_runs").select("*").order("iniciado_em", { ascending: false }).limit(12);
if (error) console.log("sync_runs err:", error.message);
else for (const r of runs) console.log(JSON.stringify(r));
