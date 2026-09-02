import { readFileSync } from "node:fs";
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const { createClient } = await import("@supabase/supabase-js");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await s.from("clientes").select("id, sgp_cliente_id, nome, contratos(sgp_contrato_id, data_venda, status, vendedor_id, vendedores(nome))").in("sgp_cliente_id", ["18849","18848","18842","18841"]);
for (const c of data ?? []) {
  console.log(c.sgp_cliente_id, c.nome?.slice(0,28), "→", (c.contratos ?? []).map(x => `#${x.sgp_contrato_id} venda:${x.data_venda} ${x.status} vend:${x.vendedores?.nome ?? "SEM"}`).join(" | ") || "SEM CONTRATO");
}
// tem ticket?
const { data: cli } = await s.from("clientes").select("id, sgp_cliente_id").in("sgp_cliente_id", ["18849","18848","18842","18841"]);
for (const c of cli ?? []) {
  const { data: cts } = await s.from("contratos").select("id").eq("cliente_id", c.id);
  for (const ct of cts ?? []) {
    const { data: tks } = await s.from("tickets").select("id, etapa, vendedor_id").eq("contrato_id", ct.id);
    console.log(`cliente ${c.sgp_cliente_id} contrato ${ct.id.slice(0,8)}: tickets=${(tks ?? []).length}`);
  }
}
