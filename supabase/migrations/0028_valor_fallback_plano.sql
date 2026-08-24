-- =====================================================================
-- 0028: fallback do valor da mensalidade para venda nova sem título.
-- Precedência: Vl. Base oficial (comissão) > título nominal (sync) >
-- preço de referência do plano. Sem isso, a venda recém-cadastrada (status
-- aguardando_ativacao, ainda sem fatura gerada) entra com valor 0 e zera a
-- RECEITA do ranking, mesmo com o plano correto vinculado (a contagem de
-- planos aparece certa; só o R$ ficava zerado).
-- Só preenche quando o valor está 0/null — nunca sobrescreve valor já apurado
-- (preserva descontos legítimos e o Vl. Base oficial).
create or replace function app.contrato_valor_oficial() returns trigger
language plpgsql as $$
declare
  oficial record;
  ref numeric;
begin
  -- 1) valor oficial do Detalhe Comissão (Vl. Base), quando houver
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

  -- 2) fallback: venda sem título/valor ainda -> preço de referência do plano
  if coalesce(new.valor_mensalidade, 0) = 0 and new.plano_id is not null then
    select valor_referencia into ref from planos where id = new.plano_id;
    if coalesce(ref, 0) > 0 then
      new.valor_mensalidade := ref;
    end if;
  end if;

  return new;
end $$;

-- backfill imediato: contratos sem valor mas com plano com preço de referência
update contratos c
set valor_mensalidade = p.valor_referencia
from planos p
where c.plano_id = p.id
  and coalesce(c.valor_mensalidade, 0) = 0
  and coalesce(p.valor_referencia, 0) > 0;
