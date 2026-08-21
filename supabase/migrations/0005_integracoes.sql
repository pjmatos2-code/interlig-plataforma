-- =====================================================================
-- Migração 0005: módulo de Integrações (autosserviço pela tela)
-- Credenciais e amostras ficam em tabelas SEM políticas de acesso:
-- com RLS ligada e nenhuma policy, só a service role (servidor) lê/escreve.
-- O navegador nunca vê um token — as actions devolvem valores mascarados.
-- =====================================================================

create table integracoes_config (
  sistema        text primary key check (sistema in ('sgp', 'szchat')),
  config         jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references usuarios(id) on delete set null
);

create table integracoes_amostras (
  id           uuid primary key default gen_random_uuid(),
  sistema      text not null check (sistema in ('sgp', 'szchat')),
  rota         text not null,
  http_status  integer,
  corpo        jsonb,
  coletado_em  timestamptz not null default now()
);

create index integracoes_amostras_idx on integracoes_amostras (sistema, coletado_em desc);

alter table integracoes_config   enable row level security;
alter table integracoes_amostras enable row level security;
-- (sem policies de propósito: acesso exclusivo da service role)
