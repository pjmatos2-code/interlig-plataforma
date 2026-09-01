import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const hoje = new Date().toISOString().slice(0, 10);
const { data: auto } = await s.from("tickets").select("id, cliente_nome, criado_em, etapa, desfecho, contrato_id").eq("origem_criacao", "sgp_auto").order("criado_em", { ascending: false }).limit(20);
console.log(`tickets sgp_auto (criados pela automação): ${auto.length}`);
for (const t of auto) console.log("  •", t.cliente_nome, "|", t.criado_em.slice(0, 16), "| etapa", t.etapa, t.desfecho ?? "");
const { data: conv } = await s.from("tickets").select("id, cliente_nome, fechado_em, reconciliado_em").eq("desfecho", "convertido").gte("fechado_em", hoje).limit(20);
console.log(`\ntickets fechados como Vendida HOJE: ${conv.length}`);
for (const t of conv) console.log("  •", t.cliente_nome, "| fechado", (t.fechado_em ?? "").slice(11, 16), t.reconciliado_em ? "| reconciliado ✓" : "");
