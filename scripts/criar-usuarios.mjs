#!/usr/bin/env node
/**
 * Cria (ou reaproveita) os 3 usuários de teste e faz o vínculo com a POP e a
 * vendedora do seed. Rode DEPOIS das migrações e do seed.sql.
 *
 *   npm run usuarios:criar
 *
 * Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.
 * A service role ignora RLS — por isso este script fica fora do app.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ---------- .env.local ----------
for (const arquivo of [".env.local", ".env"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SENHA = process.env.SENHA_TESTE ?? "Interlig@2026";

const USUARIOS = [
  { chave: "gestor",     nome: "Paulo Gerência",       email: "gestor@interlig.test",     perfil: "gestor" },
  { chave: "supervisor", nome: "Marcelo Supervisor",   email: "supervisor@interlig.test", perfil: "supervisor" },
  { chave: "vendedora",  nome: "Ana Paula Ferreira",   email: "vendedora@interlig.test",  perfil: "vendedora" },
];

// A vendedora de teste entra "na pele" desta vendedora do seed.
const VENDEDORA_SEED = "Ana Paula Ferreira";

async function acharOuCriarAuthUser({ email, nome }) {
  // O listUsers pagina; para 3 usuários a primeira página basta.
  const { data: lista, error: erroLista } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (erroLista) throw erroLista;

  const existente = lista.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existente) {
    await supabase.auth.admin.updateUserById(existente.id, { password: SENHA });
    return { id: existente.id, novo: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error) throw error;
  return { id: data.user.id, novo: true };
}

async function main() {
  const { data: pops, error: erroPops } = await supabase
    .from("pops").select("id, nome, cidade").order("nome");
  if (erroPops) throw erroPops;
  if (!pops?.length) {
    console.error("Nenhuma POP encontrada. Rode supabase/seed.sql antes deste script.");
    process.exit(1);
  }

  const { data: vendedoras, error: erroVend } = await supabase
    .from("vendedores").select("id, nome, pop_id").order("nome");
  if (erroVend) throw erroVend;

  const vendedoraSeed = vendedoras.find((v) => v.nome === VENDEDORA_SEED) ?? vendedoras[0];
  const popDaVendedora = pops.find((p) => p.id === vendedoraSeed.pop_id) ?? pops[0];

  const criados = [];

  for (const base of USUARIOS) {
    const { id, novo } = await acharOuCriarAuthUser(base);

    const linha = {
      id,
      nome: base.nome,
      email: base.email,
      perfil: base.perfil,
      ativo: true,
      pop_id: base.perfil === "gestor" ? null : popDaVendedora.id,
      vendedor_id: base.perfil === "vendedora" ? vendedoraSeed.id : null,
    };

    const { error } = await supabase.from("usuarios").upsert(linha, { onConflict: "id" });
    if (error) throw error;

    if (base.perfil === "supervisor") {
      const { error: e } = await supabase
        .from("pops").update({ supervisor_id: id }).eq("id", popDaVendedora.id);
      if (e) throw e;
    }

    if (base.perfil === "vendedora") {
      const { error: e } = await supabase
        .from("vendedores").update({ usuario_id: id }).eq("id", vendedoraSeed.id);
      if (e) throw e;
    }

    criados.push({ ...base, novo });
  }

  console.log("\nUsuários prontos (senha para todos: " + SENHA + ")\n");
  for (const u of criados) {
    const escopo =
      u.perfil === "gestor"
        ? "todas as POPs"
        : u.perfil === "supervisor"
          ? `POP ${popDaVendedora.nome}`
          : `vendedora ${vendedoraSeed.nome} (POP ${popDaVendedora.nome})`;
    console.log(`  ${u.perfil.padEnd(11)} ${u.email.padEnd(28)} ${escopo}${u.novo ? "" : "  [já existia, senha redefinida]"}`);
  }
  console.log("\nEntre em http://localhost:3000/login com cada um para conferir a RLS.\n");
}

main().catch((erro) => {
  console.error("Falhou:", erro.message ?? erro);
  process.exit(1);
});
