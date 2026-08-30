-- 0052: base de cálculo da regra de comissão.
--
-- Até aqui toda comissão saía das vendas da própria pessoa. Liderança não
-- funciona assim (definições da gestão em 29/08/2026):
--
--  · Coordenação de Venda Externa (Marcelo Otávio): comissão sobre o VTV dos
--    agentes sob gestão, filtrado por data de ATIVAÇÃO no período — a meta é
--    nº de agentes ativos × 25.
--  · Unidade Brasil Novo (Aline Santos): percentual sobre todas as ativações
--    da POP, inclusive as feitas por agentes de Altamira que instalam lá.
--
-- Repare que ambas contam por ATIVAÇÃO, não por data de venda: liderança
-- responde pelo que efetivamente entrou na base, não pelo que foi cadastrado.
create type base_comissao as enum ('proprias', 'equipe', 'pop');

alter table regras_comissao
  add column if not exists base_calculo base_comissao not null default 'proprias';

comment on column regras_comissao.base_calculo is
  'proprias = vendas da própria pessoa (por data de venda); equipe = agentes sob coordenação; pop = toda a POP. Equipe e pop contam por data de ativação.';
