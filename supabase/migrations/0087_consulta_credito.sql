-- =====================================================================
-- 0087: consulta de crédito por PDF da Consult Center (21/09/2026).
--
-- Fase 1 = MONITORAMENTO: a plataforma identifica, classifica, alerta e
-- registra — NUNCA bloqueia venda, contrato, OS, agendamento ou ativação.
-- A passagem para o modo "enforced" é decisão explícita da gestão e NÃO
-- está habilitada nesta entrega (feature flag em integracoes_config).
-- =====================================================================

-- credores conhecidos (administrável): MOV = provedor de internet.
-- Só match EXATO (nome ou alias cadastrado) marca a pendência — nome
-- "parecido" não classifica.
create table if not exists credores_conhecidos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  categoria text not null,
  origem    text not null default 'Classificação informada pela gestão Interlig',
  aliases   text[] not null default '{}',
  criado_em timestamptz not null default now()
);

insert into credores_conhecidos (nome, categoria)
values ('MOV', 'Provedor de internet')
on conflict (nome) do nothing;

-- consultas versionadas: nova consulta NÃO apaga a anterior (auditoria)
create table if not exists consultas_credito (
  id                 uuid primary key default gen_random_uuid(),
  ticket_id          uuid not null references tickets(id) on delete cascade,
  versao             integer not null,
  atual              boolean not null default true,
  arquivo_path       text not null,        -- bucket privado, sem CPF no nome
  nome_titular       text,
  cpf                text,                 -- 11 dígitos (string)
  score              integer,              -- null = "não identificado" (≠ zero!)
  faixa              text,                 -- verde | amarelo | vermelho (régua Interlig)
  adiantamento_valor numeric(10,2),
  protocolo          text,
  consulta_em        timestamptz,          -- "Resultado da consulta" do relatório
  codigo_associado   text,
  unidade_declarada  text,
  pendencias_qtd     integer not null default 0,
  pendencias_valor   numeric(12,2) not null default 0,
  pendencia_recente  date,
  ocorrencias        jsonb not null default '[]'::jsonb, -- detalhe: data/modalidade/valor/contrato/credor
  pendencia_provedor boolean not null default false,
  cpf_confere        boolean,              -- null = ticket sem CPF para comparar
  sgp_vinculo        text,                 -- compativel | pendente | divergente
  criado_por         uuid references usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),
  unique (ticket_id, versao)
);
create index if not exists consultas_credito_ticket_idx
  on consultas_credito (ticket_id, versao desc);

-- histórico estruturado dos prosseguimentos sem pagamento confirmado
-- (métrica do piloto: quantas vendas avançaram sem o adiantamento)
create table if not exists credito_prosseguimentos (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references tickets(id) on delete cascade,
  usuario_id        uuid references usuarios(id) on delete set null,
  faixa             text,
  valor_recomendado numeric(10,2),
  status_pagamento  text not null,
  criado_em         timestamptz not null default now()
);
create index if not exists credito_prosseguimentos_ticket_idx
  on credito_prosseguimentos (ticket_id, criado_em desc);

-- score vindo de consulta processada não tem edição manual comum
alter table tickets add column if not exists score_origem text;
comment on column tickets.score_origem is
  'manual = digitado pela vendedora | consulta = extraído do PDF Consult Center (sem edição manual)';

-- feature flag da política: monitoring (atual) | enforced (futuro, decisão da gestão)
alter table integracoes_config drop constraint if exists integracoes_config_sistema_check;
alter table integracoes_config add constraint integracoes_config_sistema_check
  check (sistema in ('sgp', 'szchat', 'site', 'anthropic', 'politica_credito'));
insert into integracoes_config (sistema, config)
values ('politica_credito', '{"modo": "monitoring"}'::jsonb)
on conflict (sistema) do nothing;

-- bucket privado dos PDFs (dados pessoais: nunca URL pública)
insert into storage.buckets (id, name, public)
values ('consultas-credito', 'consultas-credito', false)
on conflict (id) do nothing;

-- RLS: leitura para quem opera o CRM + gestão + direção; escrita só pela
-- service role (server actions) — sem policies de insert/update/DELETE de
-- propósito: usuário operacional não apaga o histórico (auditoria), e a
-- exclusão de ticket pelo gestor segue funcionando pelo cascade do banco
alter table consultas_credito enable row level security;
alter table credores_conhecidos enable row level security;
alter table credito_prosseguimentos enable row level security;

drop policy if exists consultas_credito_sel on consultas_credito;
create policy consultas_credito_sel on consultas_credito for select to authenticated
  using (app.eh_gestor() or app.eh_direcao() or app.opera_crm());
drop policy if exists credores_conhecidos_sel on credores_conhecidos;
create policy credores_conhecidos_sel on credores_conhecidos for select to authenticated
  using (true);
drop policy if exists credito_prosseguimentos_sel on credito_prosseguimentos;
create policy credito_prosseguimentos_sel on credito_prosseguimentos for select to authenticated
  using (app.eh_gestor() or app.eh_direcao() or app.opera_crm());
