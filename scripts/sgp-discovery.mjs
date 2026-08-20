#!/usr/bin/env node
/**
 * Fase 0 (PRD seção 9): descoberta da API real do SGP da Interlig.
 * Autentica com token+app do .env.local, chama os endpoints de consulta e
 * salva amostras MASCARADAS em docs/sgp-samples/raw-<rota>.json para fechar
 * o mapeamento campo-a-campo do SgpApiClient.
 *
 *   node scripts/sgp-discovery.mjs
 *
 * Só roda com SGP_BASE_URL, SGP_TOKEN e SGP_APP preenchidos.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

for (const arquivo of [".env.local", ".env"]) {
  if (!existsSync(arquivo)) continue;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const BASE = (process.env.SGP_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.SGP_TOKEN;
const APP = process.env.SGP_APP;
if (!BASE || !TOKEN || !APP) {
  console.error("Preencha SGP_BASE_URL, SGP_TOKEN e SGP_APP no .env.local antes de rodar.");
  process.exit(1);
}

// Rotas candidatas da documentação pública do SGP (bookstack.sgp.net.br).
// A instância da Interlig confirma quais existem.
const ROTAS = [
  "/api/ura/clientes/",
  "/api/ura/consultacliente/",
  "/api/ura/contratos/",
  "/api/ura/planos/",
  "/api/ura/titulos/",
  "/api/ura/ocorrencias/",
];

const MASCARAR = [
  ["cpf", (v) => String(v).replace(/\d(?=\d{2})/g, "*")],
  ["cnpj", (v) => String(v).replace(/\d(?=\d{2})/g, "*")],
  ["rg", () => "***"],
  ["email", () => "mascarado@exemplo.com"],
  ["senha", () => "***"],
  ["telefone", (v) => String(v).replace(/\d(?=\d{2})/g, "*")],
  ["celular", (v) => String(v).replace(/\d(?=\d{2})/g, "*")],
];

function mascarar(valor) {
  if (Array.isArray(valor)) return valor.slice(0, 5).map(mascarar);
  if (valor && typeof valor === "object") {
    const saida = {};
    for (const [chave, v] of Object.entries(valor)) {
      const regra = MASCARAR.find(([nome]) => chave.toLowerCase().includes(nome));
      saida[chave] = regra ? regra[1](v) : mascarar(v);
    }
    return saida;
  }
  return valor;
}

for (const rota of ROTAS) {
  const nome = `raw-${rota.replace(/\//g, "-").replace(/^-|-$/g, "")}.json`;
  process.stdout.write(`${rota} ... `);
  try {
    const resposta = await fetch(`${BASE}${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: TOKEN, app: APP }),
    });
    const texto = await resposta.text();
    let corpo;
    try { corpo = JSON.parse(texto); } catch { corpo = { _texto: texto.slice(0, 2000) }; }
    writeFileSync(
      `docs/sgp-samples/${nome}`,
      JSON.stringify({ http: resposta.status, corpo: mascarar(corpo) }, null, 2)
    );
    console.log(`${resposta.status} → docs/sgp-samples/${nome}`);
  } catch (erro) {
    console.log(`falhou: ${erro.message}`);
  }
}
console.log("\nCom as amostras salvas, ajustar o mapeamento em lib/sgp/api.ts (Fase 0 concluída).");
