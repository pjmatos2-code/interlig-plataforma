import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { count } = await s.from("clientes").select("*", { count: "exact", head: true });
console.log("clientes na base:", count);
const { count: cc } = await s.from("contratos").select("*", { count: "exact", head: true });
console.log("contratos na base:", cc);
