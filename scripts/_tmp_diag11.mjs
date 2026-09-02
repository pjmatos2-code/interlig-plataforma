import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: cfg } = await s.from("integracoes_config").select("config, atualizado_em").eq("sistema", "szchat").maybeSingle();
console.log("szchat robo_diurno_em:", cfg?.config?.robo_diurno_em, "| atualizado:", cfg?.atualizado_em);
const { data: runs } = await s.from("sync_runs").select("entidade, iniciado_em, registros, status, erro").in("entidade", ["szchat", "sz_robo", "robo_sz"]).order("iniciado_em", { ascending: false }).limit(6);
for (const r of runs ?? []) console.log(JSON.stringify(r));
// tickets sz_auto por dia na última semana
const { data: t } = await s.from("tickets").select("criado_em").eq("origem_criacao", "sz_auto").gte("criado_em", "2026-08-26").limit(1000);
const porDia = {};
for (const x of t ?? []) { const d = x.criado_em.slice(0,10); porDia[d] = (porDia[d] ?? 0) + 1; }
console.log("sz_auto por dia:", JSON.stringify(porDia));
