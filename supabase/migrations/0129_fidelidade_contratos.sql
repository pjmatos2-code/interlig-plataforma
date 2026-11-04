-- =====================================================================
-- 0129: lista nominal da fidelidade da base (04/11/2026).
--
-- Pedido do Paulo: clicar no número de um plano (ex.: "200 MB corporativo")
-- e ver exatamente quem são os clientes, para entrar em contato. O SGP não
-- filtra pelo grupo de plano da plataforma nem tira permutas, isentos e
-- órgãos públicos — então a leitura diária do relatório Fidelidades passa a
-- guardar também os contratos de cada unidade e faixa, já com o grupo do
-- plano (o mesmo do gráfico). Nome, telefone e mensalidade vêm do cadastro
-- (contratos/clientes) na hora de mostrar.
--
-- Dado pessoal: só a service role lê (RLS ligada e sem política). A tela e a
-- planilha checam o perfil antes (gestor, direção, agentes de atendimento e
-- coordenação de unidade, restrita à própria unidade).
-- =====================================================================

create table if not exists public.fidelidade_contratos (
  pop_sgp_id      integer not null,
  faixa           text not null check (faixa in ('sem', 'ate30', 'ate60', 'ate90')),
  sgp_contrato_id text not null,
  sgp_cliente_id  text,
  cliente         text,
  plano           text,
  familia         text not null,
  fim_fidelidade  date,
  dias_restantes  integer,
  atualizado_em   timestamptz not null default now(),
  primary key (pop_sgp_id, faixa, sgp_contrato_id)
);

create index if not exists fidelidade_contratos_familia_idx
  on public.fidelidade_contratos (faixa, familia);

alter table public.fidelidade_contratos enable row level security;

comment on table public.fidelidade_contratos is
  'Contratos de cada unidade e faixa do relatório Fidelidades do SGP (os que contam: sem permutas, isentos e órgãos públicos). Regravado a cada leitura. Só a service role lê.';

notify pgrst, 'reload schema';
