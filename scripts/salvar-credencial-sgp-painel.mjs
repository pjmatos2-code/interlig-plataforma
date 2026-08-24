// Salva a credencial do leitor do painel SGP (identificação do vendedor).
// Rode: node scripts/salvar-credencial-sgp-painel.mjs USUARIO SENHA
// Sugestão: use um usuário do SGP só de leitura, criado para o robô.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const a of [".env.local", ".env"]) {
  if (!existsSync(a)) continue;
  for (const l of readFileSync(a, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const [usuario, senha] = process.argv.slice(2);
if (!usuario || !senha) {
  console.error("uso: node scripts/salvar-credencial-sgp-painel.mjs <usuario> <senha>");
  process.exit(1);
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from("integracoes_config").select("config").eq("sistema", "sgp").maybeSingle();
const cfg = { ...(data?.config || {}), painel_usuario: usuario, painel_senha: senha };
const { error } = await s.from("integracoes_config").update({ config: cfg }).eq("sistema", "sgp");
console.log(error ? "ERRO: " + error.message : "credencial do painel SGP salva OK (" + usuario + ")");
