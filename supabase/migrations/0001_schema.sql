-- =====================================================================
-- Interlig — Plataforma de Inteligência Comercial
-- Migração 0001: schema completo (PRD seção 7.2)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type perfil_usuario      as enum ('gestor', 'supervisor', 'vendedora');
create type categoria_origem    as enum ('venda_externa', 'trafego_pago', 'presencial', 'indicacao', 'outro');
create type status_contrato     as enum ('pendente_assinatura', 'aguardando_ativacao', 'ativo', 'suspenso', 'cancelado');
create type status_titulo       as enum ('aberto', 'liquidado', 'cancelado');
create type escopo_meta         as enum ('global', 'pop', 'vendedora');
create type status_sync         as enum ('executando', 'sucesso', 'parcial', 'erro');
create type etapa_ticket        as enum ('novo', 'em_atendimento', 'proposta', 'aguardando', 'fechado');
create type desfecho_ticket     as enum ('convertido', 'nao_convertido');
create type fechado_por_ticket  as enum ('vendedora', 'auto_inatividade');
create type origem_criacao_ticket as enum ('sz_auto', 'manual');
create type tipo_evento_ticket  as enum ('criacao', 'mudanca_etapa', 'nota', 'reatribuicao',
                                         'fechamento', 'reabertura', 'webhook_sz', 'reconciliacao');

comment on type fechado_por_ticket is
  'Fechamento humano (vendedora, supervisor ou gestor) grava "vendedora"; quem de fato fechou fica em ticket_eventos.usuario_id. Valores conforme PRD 7.2.';

-- ---------------------------------------------------------------------
-- Cadastros base
-- ---------------------------------------------------------------------
create table pops (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cidade        text not null,
  supervisor_id uuid,                    -- FK adicionada depois de usuarios (referência circular)
  criado_em     timestamptz not null default now(),
  unique (nome)
);

create table usuarios (
  id           uuid primary key references auth.users(id) on delete cascade,
  nome         text not null,
  email        text not null unique,
  perfil       perfil_usuario not null,
  pop_id       uuid references pops(id) on delete set null,
  vendedor_id  uuid,                     -- FK adicionada depois de vendedores
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

create table vendedores (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  sgp_vendedor_id text unique,           -- null enquanto a vendedora não existir no SGP
  pop_id          uuid references pops(id) on delete set null,
  usuario_id      uuid unique references usuarios(id) on delete set null,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

alter table pops
  add constraint pops_supervisor_fk foreign key (supervisor_id) references usuarios(id) on delete set null;
alter table usuarios
  add constraint usuarios_vendedor_fk foreign key (vendedor_id) references vendedores(id) on delete set null;

-- Nota: supervisor sem pop_id e vendedora sem vendedor_id são estados VÁLIDOS
-- (usuário recém-convidado, ainda sem vínculo). A RLS trata isso sozinha: sem
-- vínculo, o escopo é vazio — a pessoa entra e não vê linha nenhuma.

create table planos (
  id               uuid primary key default gen_random_uuid(),
  sgp_plano_id     text unique,
  nome             text not null,
  velocidade       text,
  valor_referencia numeric(10,2) not null default 0,
  ativo            boolean not null default true
);

create table origem_map (
  id        uuid primary key default gen_random_uuid(),
  valor_sgp text not null unique,
  categoria categoria_origem not null
);

create table calendario (
  data     date primary key,
  dia_util boolean not null,
  feriado  text
);

create table bairros_geo (
  id             uuid primary key default gen_random_uuid(),
  cidade         text not null,
  bairro         text not null,
  lat_centroide  double precision,
  lng_centroide  double precision,
  unique (cidade, bairro)
);

-- ---------------------------------------------------------------------
-- Núcleo comercial (espelho do SGP)
-- ---------------------------------------------------------------------
create table clientes (
  id              uuid primary key default gen_random_uuid(),
  sgp_cliente_id  text unique,
  nome            text not null,
  cpf             text,
  telefone        text,
  bairro          text,
  cidade          text,
  lat             double precision,
  lng             double precision,
  origem_cadastro categoria_origem,
  sync_updated_at timestamptz not null default now()
);

create table contratos (
  id                  uuid primary key default gen_random_uuid(),
  sgp_contrato_id     text unique,
  cliente_id          uuid not null references clientes(id) on delete restrict,
  vendedor_id         uuid references vendedores(id) on delete set null,  -- null = "não atribuída" (PRD seção 2)
  plano_id            uuid references planos(id) on delete set null,
  pop_id              uuid references pops(id) on delete set null,
  valor_mensalidade   numeric(10,2) not null default 0,
  valor_instalacao    numeric(10,2) not null default 0,
  status              status_contrato not null,
  origem_cadastro     categoria_origem,
  data_venda          date not null,
  data_assinatura     date,
  data_ativacao       date,
  data_cancelamento   date,
  motivo_cancelamento text,
  sync_updated_at     timestamptz not null default now(),
  criado_em           timestamptz not null default now(),
  check (data_assinatura   is null or data_assinatura   >= data_venda),
  check (data_ativacao     is null or data_ativacao     >= data_venda),
  check (data_cancelamento is null or data_cancelamento >= data_venda),
  check ((status = 'cancelado') = (data_cancelamento is not null))
);

create index contratos_data_venda_idx     on contratos (data_venda desc);
create index contratos_vendedor_idx       on contratos (vendedor_id, data_venda desc);
create index contratos_pop_idx            on contratos (pop_id, data_venda desc);
create index contratos_status_idx         on contratos (status);
create index contratos_data_ativacao_idx  on contratos (data_ativacao);
create index contratos_origem_idx         on contratos (origem_cadastro);

create table titulos (
  id             uuid primary key default gen_random_uuid(),
  sgp_titulo_id  text unique,
  contrato_id    uuid not null references contratos(id) on delete cascade,
  numero_parcela integer not null,
  valor          numeric(10,2) not null,
  vencimento     date not null,
  data_pagamento date,
  status         status_titulo not null default 'aberto',
  sync_updated_at timestamptz not null default now()
);

create index titulos_contrato_idx   on titulos (contrato_id, numero_parcela);
create index titulos_vencimento_idx on titulos (vencimento);
-- 5.11 (inadimplência de 1ª fatura) olha só a parcela 1
create index titulos_primeira_idx   on titulos (vencimento) where numero_parcela = 1;

-- ---------------------------------------------------------------------
-- Metas e comissionamento (PRD seções 3.7 e 6)
-- ---------------------------------------------------------------------
create table metas (
  id                uuid primary key default gen_random_uuid(),
  escopo            escopo_meta not null,
  referencia_id     uuid,                       -- pop_id ou vendedor_id conforme o escopo
  mes_ano           date not null,              -- sempre dia 1 do mês
  quantidade_vendas integer not null,
  receita           numeric(12,2),
  criado_em         timestamptz not null default now(),
  criado_por        uuid references usuarios(id) on delete set null,
  check (mes_ano = date_trunc('month', mes_ano)::date),
  check ((escopo = 'global') = (referencia_id is null)),
  unique (escopo, referencia_id, mes_ano)
);

create table regras_comissao (
  id               uuid primary key default gen_random_uuid(),
  escopo           escopo_meta not null,
  referencia_id    uuid,
  vigencia_inicio  date not null,
  vigencia_fim     date,
  degraus          jsonb not null,   -- [{atingimento_min, atingimento_max, tipo, valor, bonus_fixo}]
  gatilhos         jsonb not null default '[]'::jsonb,
  estorno_dias     integer not null default 90,
  criado_em        timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  check (jsonb_typeof(degraus) = 'array' and jsonb_array_length(degraus) > 0)
);

create table comissoes_fechadas (
  id          uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references vendedores(id) on delete restrict,
  mes_ano     date not null,
  snapshot    jsonb not null,        -- imutável (PRD seção 6)
  valor_total numeric(12,2) not null,
  fechado_em  timestamptz not null default now(),
  fechado_por uuid references usuarios(id) on delete set null,
  unique (vendedor_id, mes_ano)
);

-- ---------------------------------------------------------------------
-- Sincronizações (PRD 7.1)
-- ---------------------------------------------------------------------
create table sync_runs (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null,        -- clientes | contratos | titulos | planos | szchat ...
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz,
  registros     integer not null default 0,
  status        status_sync not null default 'executando',
  erro          text
);

create index sync_runs_recentes_idx on sync_runs (entidade, iniciado_em desc);

-- ---------------------------------------------------------------------
-- CRM Comercial (PRD 3.9)
-- ---------------------------------------------------------------------
create table motivos_nao_conversao (
  id    uuid primary key default gen_random_uuid(),
  nome  text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0
);

create table sz_atendentes_map (
  id               uuid primary key default gen_random_uuid(),
  sz_atendente_id  text not null unique,
  sz_atendente_nome text,
  vendedor_id      uuid not null references vendedores(id) on delete cascade
);

create table tickets (
  id                   uuid primary key default gen_random_uuid(),
  origem_criacao       origem_criacao_ticket not null default 'manual',
  sz_conversa_id       text,
  cliente_nome         text not null,
  telefone             text,
  cpf                  text,
  vendedor_id          uuid references vendedores(id) on delete set null,  -- null = "não atribuído"
  pop_id               uuid references pops(id) on delete set null,
  etapa                etapa_ticket not null default 'novo',
  criado_em            timestamptz not null default now(),
  primeira_tratativa_em timestamptz,
  followup_em          timestamptz,
  fechado_em           timestamptz,
  desfecho             desfecho_ticket,
  fechado_por          fechado_por_ticket,
  motivo_id            uuid references motivos_nao_conversao(id) on delete restrict,
  plano_id             uuid references planos(id) on delete set null,
  origem_cadastro      categoria_origem,
  contrato_id          uuid references contratos(id) on delete set null,
  reconciliado_em      timestamptz,
  reaberto_de_id       uuid references tickets(id) on delete set null,
  atualizado_em        timestamptz not null default now(),

  -- Fechamento obrigatório com desfecho (PRD 3.9 — regra central)
  constraint ticket_fechado_exige_desfecho
    check ((etapa = 'fechado') = (desfecho is not null and fechado_em is not null)),
  constraint ticket_convertido_exige_plano_e_origem
    check (desfecho is distinct from 'convertido'
           or (plano_id is not null and origem_cadastro is not null
               and (coalesce(cpf, '') <> '' or coalesce(telefone, '') <> ''))),
  constraint ticket_nao_convertido_exige_motivo
    check (desfecho is distinct from 'nao_convertido' or motivo_id is not null),
  constraint ticket_fechado_tem_autor
    check ((desfecho is null) = (fechado_por is null)),
  constraint ticket_identificacao_minima
    check (coalesce(cpf, '') <> '' or coalesce(telefone, '') <> '')
);

create index tickets_vendedor_idx  on tickets (vendedor_id, etapa);
create index tickets_pop_idx       on tickets (pop_id, etapa);
create index tickets_abertos_idx   on tickets (atualizado_em) where etapa <> 'fechado';
create index tickets_telefone_idx  on tickets (telefone);
create index tickets_cpf_idx       on tickets (cpf);
create index tickets_fechados_idx  on tickets (fechado_em desc) where etapa = 'fechado';
create unique index tickets_sz_conversa_idx on tickets (sz_conversa_id) where sz_conversa_id is not null;

create table ticket_eventos (
  id        uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete restrict,
  tipo      tipo_evento_ticket not null,
  dados     jsonb not null default '{}'::jsonb,
  usuario_id uuid references usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index ticket_eventos_ticket_idx on ticket_eventos (ticket_id, criado_em);

-- Idempotência do webhook do SZ Chat (PRD 7.1): mesmo evento duas vezes não duplica nada.
create unique index ticket_eventos_webhook_idx
  on ticket_eventos ((dados->>'sz_evento_id'))
  where tipo = 'webhook_sz' and dados ? 'sz_evento_id';
