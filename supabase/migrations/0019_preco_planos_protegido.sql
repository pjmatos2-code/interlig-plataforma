-- 0019: o sync upserta planos com valor_referencia=0 (a API do SGP não expõe
-- preço) e apagava os preços reais preenchidos a partir dos contratos.
-- O gatilho impede rebaixar um preço real para 0.
create or replace function app.plano_preserva_preco() returns trigger
language plpgsql as $$
begin
  if coalesce(new.valor_referencia, 0) = 0 and coalesce(old.valor_referencia, 0) > 0 then
    new.valor_referencia := old.valor_referencia;
  end if;
  return new;
end $$;

drop trigger if exists planos_preserva_preco on planos;
create trigger planos_preserva_preco
  before update on planos
  for each row execute function app.plano_preserva_preco();

-- repor os preços: moda do valor de mensalidade dos contratos vendidos
with preco as (
  select plano_id, mode() within group (order by valor_mensalidade) as val
  from contratos
  where valor_mensalidade > 0
  group by plano_id
)
update planos p
set valor_referencia = preco.val
from preco
where preco.plano_id = p.id
  and coalesce(p.valor_referencia, 0) = 0;
