-- =====================================================================
-- 0016 (D12): mensalidade oficial = Vl. Base do Detalhe Comissão do SGP.
-- A aproximação por título gravava a 1ª fatura PRÓ-RATA (~metade do real).
-- O gatilho pina o valor oficial (e o vendedor do PDF, se faltar) em todo
-- insert/update — o sync de 5 min não consegue mais rebaixar o valor.
-- =====================================================================
create or replace function app.contrato_valor_oficial() returns trigger
language plpgsql as $$
declare
  oficial record;
begin
  select vl_base, vendedor_id into oficial
  from comissao_sgp_itens
  where sgp_contrato_id = new.sgp_contrato_id and coalesce(vl_base, 0) > 0
  order by competencia desc
  limit 1;
  if found then
    new.valor_mensalidade := oficial.vl_base;
    if new.vendedor_id is null then
      new.vendedor_id := oficial.vendedor_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists contratos_valor_oficial on contratos;
create trigger contratos_valor_oficial
  before insert or update on contratos
  for each row execute function app.contrato_valor_oficial();

-- correção imediata de agosto: aplica o Vl. Base aos contratos já gravados
update contratos c
set valor_mensalidade = s.vl_base,
    vendedor_id = coalesce(c.vendedor_id, s.vendedor_id)
from comissao_sgp_itens s
where s.sgp_contrato_id = c.sgp_contrato_id
  and coalesce(s.vl_base, 0) > 0
  and (c.valor_mensalidade is distinct from s.vl_base
       or (c.vendedor_id is null and s.vendedor_id is not null));
