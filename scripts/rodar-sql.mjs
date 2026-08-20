#!/usr/bin/env node
/**
 * Executa arquivos SQL no banco do Supabase, na ordem passada:
 *   node scripts/rodar-sql.mjs supabase/migrations/0001_schema.sql [...]
 *
 * Usa DATABASE_URL do .env.local. Se a conexão direta (IPv6) não estiver
 * disponível na rede, cai automaticamente para o session pooler (IPv4).
 */
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

for (const arquivo of [".env.local", ".env"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const direta = process.env.DATABASE_URL;
if (!direta) {
  console.error("DATABASE_URL não definida no .env.local.");
  process.exit(1);
}

// pooler: usuário postgres.<ref> no host regional, porta 5432 (session mode)
function urlPooler(url, host) {
  const u = new URL(url);
  const ref = u.hostname.split(".")[1]; // db.<ref>.supabase.co
  u.username = `postgres.${ref}`;
  u.hostname = host;
  u.port = "5432";
  return u.toString();
}

const candidatas = [
  { nome: "conexão direta", url: direta },
  { nome: "session pooler (aws-1)", url: urlPooler(direta, "aws-1-us-east-1.pooler.supabase.com") },
  { nome: "session pooler (aws-0)", url: urlPooler(direta, "aws-0-us-east-1.pooler.supabase.com") },
];

async function conectar() {
  for (const c of candidatas) {
    const cliente = new pg.Client({
      connectionString: c.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 12000,
    });
    try {
      await cliente.connect();
      console.log(`Conectado via ${c.nome}.`);
      return cliente;
    } catch (erro) {
      console.log(`  ${c.nome}: ${erro.message}`);
    }
  }
  throw new Error("Nenhuma rota de conexão funcionou. Confira a senha do banco.");
}

const arquivos = process.argv.slice(2);
if (!arquivos.length) {
  console.error("Informe ao menos um arquivo .sql.");
  process.exit(1);
}

const cliente = await conectar();
try {
  for (const arquivo of arquivos) {
    const sql = readFileSync(arquivo, "utf8");
    process.stdout.write(`Executando ${arquivo} ... `);
    const inicio = Date.now();
    await cliente.query(sql);
    console.log(`ok (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
  }
} finally {
  await cliente.end();
}
