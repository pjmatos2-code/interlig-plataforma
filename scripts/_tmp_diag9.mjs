import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: t } = await s.from("tickets").select("id, cliente_nome, vendedor_id, origem_criacao, criado_em, etapa, contrato_id, contratos(vendedor_id, data_venda, vendedores(nome))").eq("origem_criacao", "sgp_auto").gte("criado_em", "2026-08-30").order("criado_em");
console.log(`tickets sgp_auto desde 30/08: ${t.length}`);
let semVend = 0, divergentes = 0;
for (const x of t) {
  const vendContrato = x.contratos?.vendedor_id ?? null;
  if (!x.vendedor_id) semVend++;
  if (x.vendedor_id !== vendContrato) {
    divergentes++;
    console.log(` - ${x.cliente_nome?.slice(0,25)} | ticket.vend=${x.vendedor_id?.slice(0,8) ?? "NULL"} | contrato.vend=${vendContrato?.slice(0,8) ?? "NULL"} (${x.contratos?.vendedores?.nome ?? "—"}) | venda ${x.contratos?.data_venda}`);
  }
}
console.log(`sem vendedor no ticket: ${semVend} | divergentes do contrato: ${divergentes}`);
// mesma checagem para os convertidos automaticos (sz_auto convertidos ontem/hoje)
const { data: t2 } = await s.from("tickets").select("id, cliente_nome, vendedor_id, contratos(vendedor_id, vendedores(nome))").eq("etapa", "fechado").eq("desfecho", "convertido").gte("fechado_em", "2026-08-30");
let div2 = 0;
for (const x of t2) { if (x.contratos && x.vendedor_id !== x.contratos.vendedor_id) div2++; }
console.log(`fechados convertidos desde 30/08: ${t2.length} | com vendedor diferente do contrato: ${div2}`);
