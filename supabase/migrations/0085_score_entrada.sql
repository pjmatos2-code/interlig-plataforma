-- 0085: filtro de entrada por score (modelo Adiantamento de Fatura, 17/09/2026).
--
-- A vendedora lança o score no ticket; a plataforma enquadra na faixa e
-- registra o adiantamento de mensalidade (que o financeiro converte em
-- crédito no SGP). Régua configurável em score_regua.

create table if not exists score_regua (
  faixa      text primary key,          -- verde | amarelo | vermelho
  score_min  integer not null,
  score_max  integer not null,
  valor      numeric(10,2) not null,    -- adiantamento de mensalidade (0 = sem)
  ordem      smallint not null
);

insert into score_regua (faixa, score_min, score_max, valor, ordem) values
  ('verde',    501, 1000,   0.00, 1),
  ('amarelo',  301,  500,  49.00, 2),
  ('vermelho',   0,  300, 100.00, 3)
on conflict (faixa) do nothing;

alter table score_regua enable row level security;
drop policy if exists score_regua_sel on score_regua;
create policy score_regua_sel on score_regua for select to authenticated using (true);

alter table tickets add column if not exists score integer;
alter table tickets add column if not exists score_faixa text;
alter table tickets add column if not exists adiantamento_valor numeric(10,2);
alter table tickets add column if not exists adiantamento_recebido_em timestamptz;
alter table tickets add column if not exists adiantamento_recebido_por uuid references usuarios(id) on delete set null;

comment on column tickets.score is 'Score de crédito lançado pela vendedora (0-1000) — régua em score_regua';
comment on column tickets.adiantamento_valor is 'Adiantamento de mensalidade da faixa no momento do lançamento (vira crédito nas faturas, não é taxa)';
