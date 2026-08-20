import { readFileSync } from "node:fs";
import pg from "pg";
for (const linha of readFileSync(".env.local", "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (sql) => (await c.query(sql)).rows;

const [vendasMes] = await q(`
  select count(*)::int as n from contratos
  where data_venda >= date_trunc('month', current_date)::date and data_venda <= current_date
    and not (status = 'cancelado' and data_ativacao is null
             and lower(coalesce(motivo_cancelamento,'')) in ('erro de cadastro','duplicidade'))`);
const [receita] = await q(`
  select round(sum(valor_mensalidade),2)::float as r, round(avg(valor_mensalidade),2)::float as tm from contratos
  where data_venda >= date_trunc('month', current_date)::date and data_venda <= current_date
    and not (status = 'cancelado' and data_ativacao is null
             and lower(coalesce(motivo_cancelamento,'')) in ('erro de cadastro','duplicidade'))`);
const [meta] = await q(`select quantidade_vendas::int as m from metas where escopo='global' and mes_ano = date_trunc('month', current_date)::date`);
const [dias] = await q(`
  select count(*) filter (where data >= current_date)::int as restantes,
         count(*)::int as total_mes
  from calendario where dia_util and data >= date_trunc('month', current_date)::date
    and data < (date_trunc('month', current_date) + interval '1 month')::date`);
const [pend] = await q(`
  select count(*) filter (where data_assinatura is not null and data_ativacao is null)::int as ativ,
         count(*) filter (where data_assinatura is not null and data_ativacao is null and current_date - data_assinatura > 7)::int as ativ_alerta,
         count(*) filter (where data_assinatura is null)::int as assin,
         count(*) filter (where data_assinatura is null and current_date - data_venda >= 2)::int as assin_alerta
  from contratos where status <> 'cancelado'`);

const pace = (meta.m - vendasMes.n) / dias.restantes;
console.log(`vendas do mês (5.1): ${vendasMes.n}`);
console.log(`receita contratada (5.2): R$ ${receita.r} | ticket médio (5.3): R$ ${receita.tm}`);
console.log(`meta global: ${meta.m} | %meta (5.4): ${(vendasMes.n/meta.m*100).toFixed(0)}%`);
console.log(`dias úteis restantes (incl. hoje): ${dias.restantes} de ${dias.total_mes}`);
console.log(`pace (5.5): (${meta.m} − ${vendasMes.n}) ÷ ${dias.restantes} = ${pace.toFixed(2)}/dia útil`);
console.log(`meta diária: ${(meta.m/dias.total_mes).toFixed(1)}/dia útil`);
console.log(`5.7 ativações pendentes: ${pend.ativ} (${pend.ativ_alerta} > 7 dias)`);
console.log(`5.8 pendentes assinatura: ${pend.assin} (${pend.assin_alerta} >= 48h)`);
await c.end();
