// Salva a chave da API Anthropic (analista de conversas do módulo Retenção).
// Rode: node scripts/salvar-credencial-anthropic.mjs sk-ant-...
// A chave fica em integracoes_config (sistema 'anthropic') — nunca no código.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
for (const a of [".env.local", ".env"]) {
  if (!existsSync(a)) continue;
  for (const l of readFileSync(a, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const [chave] = process.argv.slice(2);
if (!chave || !chave.startsWith("sk-ant-")) {
  console.error("uso: node scripts/salvar-credencial-anthropic.mjs <chave sk-ant-...>");
  process.exit(1);
}
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from("integracoes_config").select("config").eq("sistema", "anthropic").maybeSingle();
if (data) {
  const { error } = await s.from("integracoes_config").update({ config: { ...data.config, api_key: chave } }).eq("sistema", "anthropic");
  console.log(error ? "ERRO: " + error.message : "chave Anthropic atualizada OK");
} else {
  const { error } = await s.from("integracoes_config").insert({ sistema: "anthropic", config: { api_key: chave, modelo: "claude-haiku-4-5-20251001" } });
  console.log(error ? "ERRO: " + error.message : "chave Anthropic salva OK");
}
// teste imediato: a chave funciona?
const r = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 24, messages: [{ role: "user", content: "responda apenas: ok" }] }),
});
const j = await r.json();
console.log(r.ok ? "teste da chave: OK — modelo respondeu" : "teste FALHOU: " + (j.error?.message ?? r.status));
