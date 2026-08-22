-- 0015: Instrução Geral de Comissionamento AGO/2026 (documento normativo)
-- 1) régua externa para Jessica Valentim e Maclicya Martins (cópia da externa vigente)
insert into regras_comissao (escopo, referencia_id, vigencia_inicio, vigencia_fim, degraus, gatilhos, estorno_dias)
select 'vendedora', v.id, r.vigencia_inicio, r.vigencia_fim, r.degraus, r.gatilhos, r.estorno_dias
from vendedores v
cross join lateral (
  select r2.vigencia_inicio, r2.vigencia_fim, r2.degraus, r2.gatilhos, r2.estorno_dias
  from regras_comissao r2
  join vendedores va on va.id = r2.referencia_id
  where va.nome = 'Andrea' and (r2.vigencia_fim is null or r2.vigencia_fim >= date '2026-08-01')
  limit 1
) r
where v.nome in ('Jessica Valentim', 'Maclicya Martins')
  and not exists (
    select 1 from regras_comissao rx
    where rx.escopo = 'vendedora' and rx.referencia_id = v.id
  );

-- 2) faixa Desafio do time externo: 25% -> 30% sobre o VTV (seção 2 da Instrução)
update regras_comissao r
set degraus = (
  select jsonb_agg(
    case when (d->>'atingimento_min')::int = 160 and (d->>'valor')::numeric = 25
         then jsonb_set(d, '{valor}', '30')
         else d end
  )
  from jsonb_array_elements(r.degraus) d
)
where exists (
  select 1 from jsonb_array_elements(r.degraus) d
  where (d->>'atingimento_min')::int = 160 and (d->>'valor')::numeric = 25
);

-- 3) metas de agosto para as externas que faltavam (meta oficial: 25)
insert into metas (escopo, referencia_id, mes_ano, quantidade_vendas)
select 'vendedora', v.id, date '2026-08-01', 25
from vendedores v
where v.nome in ('Jessica Valentim', 'Maclicya Martins')
  and not exists (
    select 1 from metas m
    where m.escopo = 'vendedora' and m.referencia_id = v.id and m.mes_ano = date '2026-08-01'
  );
