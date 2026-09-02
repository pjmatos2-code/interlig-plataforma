import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ids = ["18849", "18848", "18842", "18841", "4"];
const { data } = await s.from("clientes").select("sgp_cliente_id, nome").in("sgp_cliente_id", ids);
console.log("desses 5 do painel, existem na plataforma:", (data ?? []).map(c => c.sgp_cliente_id).join(",") || "NENHUM");
