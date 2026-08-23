// Salva a credencial do robô SZ na config (rode: node scripts/salvar-credencial-robo.mjs EMAIL SENHA)
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const a of [".env.local", ".env"]) {
  if (!existsSync(a)) continue;
  for (const l of readFileSync(a, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const [email, senha] = process.argv.slice(2);
if (!email || !senha) {
  console.error("uso: node scripts/salvar-credencial-robo.mjs <email> <senha>");
  process.exit(1);
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from("integracoes_config").select("config").eq("sistema", "szchat").maybeSingle();
const cfg = { ...(data?.config || {}), robo_email: email, robo_senha: senha };
const { error } = await s.from("integracoes_config").update({ config: cfg }).eq("sistema", "szchat");
console.log(error ? "ERRO: " + error.message : "credencial do robo salva OK (" + email + ")");
