-- 0024: faixas do Time Comercial Externo (PAP e Eventos) - meta 25
-- Regra oficial (correcao 23/08/2026): so comissiona ACIMA de 80% da meta,
-- ou seja a partir de 20 vendas. Faixas por volume de vendas:
--   < 20  (< 80%)        -> 0%   (sem degrau)
--   20-25 (80-100%)      -> 10%
--   26-31 (104-124%)     -> 15%
--   32-39 (128-156%)     -> 20%
--   >= 40 (>= 160%)      -> 30%
-- Antes o piso estava em 16 vendas (64%) e o corte 15%->20% em 24 vendas (96%).
-- Identifica as regras do time externo pelo degrau piso anterior em 64%.
update regras_comissao
set degraus = '[
  {"tipo":"percentual_receita","valor":10,"atingimento_min":80,"atingimento_max":103},
  {"tipo":"percentual_receita","valor":15,"atingimento_min":104,"atingimento_max":127},
  {"tipo":"percentual_receita","valor":20,"atingimento_min":128,"atingimento_max":159},
  {"tipo":"percentual_receita","valor":30,"atingimento_min":160,"atingimento_max":null}
]'::jsonb
where exists (
  select 1 from jsonb_array_elements(degraus) d
  where (d->>'atingimento_min')::int = 64
);
