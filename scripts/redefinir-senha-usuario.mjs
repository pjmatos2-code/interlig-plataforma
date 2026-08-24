// Redefine a senha de um usuário da plataforma (uso do Administrador).
// Rode: node scripts/redefinir-senha-usuario.mjs EMAIL NOVA_SENHA
// Ex.:  node scripts/redefinir-senha-usuario.mjs maclicya.martins@interlig.com 'SenhaProvisoria123'
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
  console.error("uso: node scripts/redefinir-senha-usuario.mjs <email> <nova_senha>");
  process.exit(1);
}
if (senha.length < 8) {
  console.error("A senha precisa de 8+ caracteres.");
  process.exit(1);
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: lista, error: e1 } = await s.auth.admin.listUsers({ perPage: 1000 });
if (e1) { console.error("ERRO ao listar:", e1.message); process.exit(1); }
const alvo = lista.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
if (!alvo) { console.error("Usuário não encontrado:", email); process.exit(1); }
const { error } = await s.auth.admin.updateUserById(alvo.id, {
  password: senha,
  email_confirm: true,
});
console.log(error ? "ERRO: " + error.message : `senha redefinida OK para ${email}`);
