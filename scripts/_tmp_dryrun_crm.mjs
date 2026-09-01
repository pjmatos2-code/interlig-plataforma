// Dry-run das rotinas do CRM: o que converterVendidosPorSgp e
// criarTicketsDeVendasSgp vao fazer na proxima execucao (sem gravar nada).
import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const tel = (t) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length >= 8 ? d.slice(-8) : d; };
const cpf = (c) => String(c ?? "").replace(/\D/g, "");
const desde = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);

const [{ data: contratos }, { data: abertos }, { data: todos }] = await Promise.all([
  s.from("contratos").select("id, sgp_contrato_id, plano_id, data_venda, vendedor_id, clientes(telefone, cpf, nome), vendedores(nome)").gte("data_venda", desde).neq("status", "cancelado").limit(1000),
  s.from("tickets").select("id, cliente_nome, telefone, cpf, etapa").neq("etapa", "fechado").limit(2000),
  s.from("tickets").select("id, contrato_id, telefone, cpf").gte("criado_em", new Date(Date.now() - 45 * 86400000).toISOString()).limit(4000),
]);
console.log(`contratos desde ${desde}: ${contratos.length} | tickets abertos: ${abertos.length}`);

const comContrato = new Set(todos.map((t) => t.contrato_id).filter(Boolean));
const chaves = new Set();
for (const t of todos) { const a = tel(t.telefone), b = cpf(t.cpf); if (a) chaves.add("t:" + a); if (b) chaves.add("c:" + b); }

let converte = [], cria = [], semId = 0;
for (const c of contratos) {
  const cli = c.clientes ?? {};
  const a = tel(cli.telefone), b = cpf(cli.cpf);
  const aberto = abertos.find((x) => (a && tel(x.telefone) === a) || (b && cpf(x.cpf) === b));
  if (aberto) { converte.push(`#${c.sgp_contrato_id} ${cli.nome} → fecha ticket "${aberto.cliente_nome}" (etapa ${aberto.etapa})`); continue; }
  if (comContrato.has(c.id)) continue; // já tem ticket vinculado
  if (!a && !b) { semId++; continue; }
  if ((a && chaves.has("t:" + a)) || (b && chaves.has("c:" + b))) continue; // ticket fechado já cobre
  cria.push(`#${c.sgp_contrato_id} ${cli.nome} (venda ${c.data_venda}${c.vendedores?.nome ? ", " + c.vendedores.nome : ""}) → ${c.plano_id ? "nasce VENDIDA" : "nasce em Criação do contrato"}`);
}
console.log(`\nVAI CONVERTER (ticket aberto casa com contrato): ${converte.length}`);
converte.slice(0, 10).forEach((x) => console.log("  •", x));
console.log(`\nVAI CRIAR TICKET AUTOMÁTICO (venda direto no SGP, sem ticket): ${cria.length}`);
cria.slice(0, 15).forEach((x) => console.log("  •", x));
console.log(`\nsem telefone/CPF no cadastro (não dá para criar): ${semId}`);
