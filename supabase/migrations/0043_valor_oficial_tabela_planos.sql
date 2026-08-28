-- =====================================================================
-- 0043: o valor da venda passa a respeitar a TABELA OFICIAL de planos.
-- Problema: o 1o boleto e pro-rata (proporcional) e contaminava o valor da
-- venda (ex.: R$ 33,30 num plano de R$ 99,90) — distorcendo resultado das
-- agentes e comissao. Precedencia nova do valor oficial:
--   1) Vl. Base do Detalhe Comissao do SGP (verdade final, com fidelidade)
--   2) preco de referencia do plano quando o valor observado for MENOR
--      (pro-rata e sempre menor; contrato atipico MAIOR e preservado,
--       ex.: condominio/multiponto)
--   3) o que veio dos titulos (sync)
-- A tabela de precos e planos.valor_referencia — editavel no Administracao.
create or replace function app.contrato_valor_oficial() returns trigger
language plpgsql as $$
declare
  oficial record;
  ref numeric;
begin
  -- 1) valor oficial do Detalhe Comissao (Vl. Base), quando houver
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
    return new;
  end if;

  -- 2) tabela oficial: pro-rata (menor que o preco do plano) sobe para o preco
  if new.plano_id is not null then
    select valor_referencia into ref from planos where id = new.plano_id;
    if coalesce(ref, 0) > 0 and coalesce(new.valor_mensalidade, 0) < ref then
      new.valor_mensalidade := ref;
    end if;
  end if;

  return new;
end $$;

-- backfill: corrige os contratos ja gravados com valor abaixo da tabela
-- (sem Vl. Base importado — quem tem Vl. Base ja esta certo)
update contratos c
set valor_mensalidade = p.valor_referencia
from planos p
where c.plano_id = p.id
  and coalesce(p.valor_referencia, 0) > 0
  and coalesce(c.valor_mensalidade, 0) < p.valor_referencia
  and not exists (
    select 1 from comissao_sgp_itens s
    where s.sgp_contrato_id = c.sgp_contrato_id and coalesce(s.vl_base, 0) > 0
  );
