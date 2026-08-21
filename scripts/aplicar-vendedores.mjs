#!/usr/bin/env node
/**
 * Aplica a atribuição venda→vendedora do JSON (importar-vendedores.py).
 * Casa o nome do vendedor do relatório com a tabela vendedores por
 * aproximação (primeiro nome, sem acento). Não sobrescreve atribuição
 * existente, a menos que --forcar.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const forcar = process.argv.includes("--forcar");
const arquivo = process.argv[2] ?? "/tmp/vendedores.json";
const dados = JSON.parse(readFileSync(arquivo, "utf8"));

const norm = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const pgc = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pgc.connect();

const { rows: vendedoras } = await pgc.query("select id, nome from vendedores where ativo");
function casar(nomeRelatorio) {
  const alvo = norm(nomeRelatorio);
  // igual, contém, ou primeiro nome igual
  for (const v of vendedoras) {
    const n = norm(v.nome);
    if (n === alvo || alvo.includes(n) || n.includes(alvo)) return v;
  }
  const primeiro = alvo.split(/[\s.@]/)[0];
  for (const v of vendedoras) {
    if (norm(v.nome).split(" ")[0] === primeiro) return v;
  }
  return null;
}

let aplicados = 0;
const semMatch = new Map();
for (const item of dados) {
  const v = casar(item.vendedor);
  if (!v) {
    semMatch.set(item.vendedor, (semMatch.get(item.vendedor) ?? 0) + 1);
    continue;
  }
  const { rowCount } = await pgc.query(
    `update contratos set vendedor_id = $1
     where sgp_contrato_id = $2 ${forcar ? "" : "and vendedor_id is null"}`,
    [v.id, item.contrato]
  );
  aplicados += rowCount;
}
console.log(`atribuições aplicadas: ${aplicados}`);
if (semMatch.size > 0) {
  console.log("nomes do relatório SEM vendedora correspondente (cadastre-as ou ignore):");
  for (const [nome, qtd] of semMatch) console.log(`  ${nome} (${qtd} vendas)`);
}
const { rows: [r] } = await pgc.query(`
  select count(*) filter (where vendedor_id is not null)::int as atribuidas, count(*)::int as total
  from contratos where data_venda >= date_trunc('month', current_date)::date`);
console.log(`vendas do mês atribuídas: ${r.atribuidas}/${r.total}`);
await pgc.end();
