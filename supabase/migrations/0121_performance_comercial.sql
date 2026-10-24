-- =====================================================================
-- 0121 — Performance Comercial (Interlig Performance Intelligence)
-- 24/10/2026. Migração SOMENTE ADITIVA: cria tabelas novas e uma coluna
-- opcional em vendedores. Nenhum dado operacional é alterado.
--
-- Todas as tabelas ficam com RLS ligada e SEM policy: só o service role lê
-- e grava. O escopo por perfil (gestor, direção, coordenador, vendedora) é
-- aplicado no servidor (lib/performance/escopo.ts), como nos demais módulos
-- analíticos. Mensagens de clientes nunca são expostas pela API do PostgREST.
--
-- Nenhuma tabela tem chave composta com duas FKs: assim o PostgREST não
-- enxerga "muitos-para-muitos" novos e os embeds existentes
-- (tickets→vendedores, contratos→vendedores…) continuam sem ambiguidade.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Conversas do chatbot (SZ Chat hoje; camada adaptadora permite trocar)
create table if not exists public.conversas_atendimento (
  id uuid primary key default gen_random_uuid(),
  provedor text not null default 'szchat',
  externo_id text not null,                       -- id interno da sessão no provedor
  protocolo text,
  ticket_id uuid references public.tickets(id) on delete set null,
  vendedor_id uuid references public.vendedores(id) on delete set null, -- agente humano principal
  agente_nome text,
  equipe text,
  pop_id uuid references public.pops(id) on delete set null,
  canal text,
  telefone text,                                  -- normalizado, só para vincular ao lead
  status_final text,                              -- classificação do provedor (success/loss)
  iniciada_em timestamptz,
  espera_inicio_em timestamptz,                   -- entrou na fila de atendimento humano
  humano_inicio_em timestamptz,
  finalizada_em timestamptz,
  encerrada_por_tempo boolean not null default false,
  primeira_msg_cliente_em timestamptz,
  primeira_resposta_em timestamptz,
  primeira_resposta_vendedor_id uuid references public.vendedores(id) on delete set null,
  primeira_resposta_seg integer,                  -- tempo bruto
  primeira_resposta_util_seg integer,             -- só dentro do expediente
  cliente_sem_resposta boolean not null default false,
  transferencias integer not null default 0,
  msgs_cliente integer not null default 0,
  msgs_agente integer not null default 0,
  msgs_automacao integer not null default 0,
  msgs_sistema integer not null default 0,
  por_agente jsonb not null default '{}'::jsonb,  -- métricas por agente humano (sem conteúdo)
  eventos jsonb not null default '[]'::jsonb,     -- ciclo de vida (sem dados pessoais)
  versao_calculo smallint not null default 1,
  coletada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint conversas_atendimento_externo_uk unique (provedor, externo_id)
);
create index if not exists conversas_atendimento_ticket_idx on public.conversas_atendimento (ticket_id);
create index if not exists conversas_atendimento_vend_idx on public.conversas_atendimento (vendedor_id, iniciada_em desc);
create index if not exists conversas_atendimento_inicio_idx on public.conversas_atendimento (iniciada_em desc);
create index if not exists conversas_atendimento_tel_idx on public.conversas_atendimento (telefone);
create index if not exists conversas_atendimento_proto_idx on public.conversas_atendimento (protocolo);

create table if not exists public.conversas_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas_atendimento(id) on delete cascade,
  externo_id text not null,
  ordem integer not null,
  autor text not null check (autor in ('cliente', 'agente', 'automacao', 'sistema')),
  agente_nome text,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  enviada_em timestamptz not null,
  tipo text,
  categoria text,                                 -- categoria de sessão do WhatsApp (iniciada pelo cliente/empresa)
  tamanho integer not null default 0,
  texto text,                                     -- mascarado (CPF, telefone, e-mail); apagado após a retenção
  constraint conversas_mensagens_externo_uk unique (conversa_id, externo_id)
);
create index if not exists conversas_mensagens_ordem_idx on public.conversas_mensagens (conversa_id, ordem);
create index if not exists conversas_mensagens_vend_idx on public.conversas_mensagens (vendedor_id, enviada_em desc);
create index if not exists conversas_mensagens_data_idx on public.conversas_mensagens (enviada_em);

-- ---------------------------------------------------------------------
-- Análises de IA por conversa — também é a FILA (status pendente)
create table if not exists public.analises_conversa (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas_atendimento(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete set null,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  versao text not null,                           -- versão do prompt + schema
  hash_entrada text not null,                     -- muda quando chegam mensagens novas (idempotência)
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'concluida', 'erro', 'descartada')),
  prioridade smallint not null default 5,         -- 1 = mais urgente
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  erro text,
  provedor text,
  modelo text,
  resultado jsonb,                                -- saída validada pelo schema
  temperatura text check (temperatura in ('quente', 'morno', 'frio', 'indeterminado')),
  intencao_compra boolean,
  objecoes text[] not null default '{}',
  status_lead text,                               -- taxonomia do Anexo A do PRD
  prioridade_lead text,
  score_atendimento numeric(5, 1),
  confianca numeric(4, 3),
  tokens_entrada integer,
  tokens_saida integer,
  custo_estimado numeric(10, 5),
  revisado_por uuid references public.usuarios(id) on delete set null,
  revisado_em timestamptz,
  revisao jsonb,                                  -- correção humana da classificação
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  constraint analises_conversa_uk unique (conversa_id, versao, hash_entrada)
);
create index if not exists analises_conversa_fila_idx on public.analises_conversa (status, prioridade, criado_em);
create index if not exists analises_conversa_vend_idx on public.analises_conversa (vendedor_id, concluido_em desc);
create index if not exists analises_conversa_ticket_idx on public.analises_conversa (ticket_id);

-- execuções em lote da IA (PRD 7.2)
create table if not exists public.analise_runs (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null default current_date,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  conversas_analisadas integer not null default 0,
  followups_gerados integer not null default 0,
  leitura_do_dia text,
  tokens_usados integer not null default 0,
  custo_estimado numeric(10, 5) not null default 0,
  status text not null default 'rodando',
  erro text
);
create index if not exists analise_runs_data_idx on public.analise_runs (data_referencia desc);

-- ---------------------------------------------------------------------
-- Follow-ups (PRD 3.10/7.2, ampliado): histórico de cada retorno previsto
create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  tipo text not null default 'retorno'
    check (tipo in ('retorno', 'mensagem', 'ligacao', 'proposta', 'visita', 'instalacao', 'outro')),
  motivo text,
  onde_parou text,
  abordagem_recomendada text,
  proximo_passo text,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  origem text not null default 'crm' check (origem in ('crm', 'ia', 'regra', 'manual', 'robo')),
  status text not null default 'programado'
    check (status in ('sugerido', 'programado', 'pendente', 'concluido_prazo', 'concluido_atraso',
                      'vencido', 'cancelado', 'rejeitado')),
  prazo timestamptz not null,
  data_referencia date,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  concluido_em timestamptz,
  concluido_por uuid references public.usuarios(id) on delete set null,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  resultado text check (resultado in ('avancou', 'assinou', 'sem_resposta', 'perdido')),
  evidencia text,                                 -- como a execução foi detectada
  analise_id uuid references public.analises_conversa(id) on delete set null,
  chave text,                                     -- deduplicação (origem + ticket + prazo)
  atualizado_em timestamptz not null default now()
);
create unique index if not exists followups_chave_idx on public.followups (chave) where chave is not null;
create index if not exists followups_ticket_idx on public.followups (ticket_id, status);
create index if not exists followups_vend_idx on public.followups (vendedor_id, prazo);
create index if not exists followups_status_idx on public.followups (status, prazo);

create table if not exists public.followups_historico (
  id bigserial primary key,
  followup_id uuid not null references public.followups(id) on delete cascade,
  evento text not null,
  dados jsonb not null default '{}'::jsonb,
  usuario_id uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists followups_historico_idx on public.followups_historico (followup_id, criado_em);

-- ---------------------------------------------------------------------
-- Central de alertas comerciais (agrupados por chave)
create table if not exists public.alertas_comerciais (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  categoria text not null check (categoria in ('critico', 'atencao', 'informativo')),
  tipo text not null,
  titulo text not null,
  detalhe text,
  evidencias jsonb not null default '{}'::jsonb,
  vendedor_id uuid references public.vendedores(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  pop_id uuid references public.pops(id) on delete set null,
  status text not null default 'aberto' check (status in ('aberto', 'reconhecido', 'resolvido', 'silenciado')),
  ocorrencias integer not null default 1,
  primeira_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  reconhecido_por uuid references public.usuarios(id) on delete set null,
  reconhecido_em timestamptz,
  resolvido_por uuid references public.usuarios(id) on delete set null,
  resolvido_em timestamptz,
  silenciado_ate timestamptz,
  notificado_em timestamptz,
  origem text not null default 'regra' check (origem in ('regra', 'ia'))
);
-- um alerta "vivo" por chave; resolvido libera a chave para nova ocorrência
create unique index if not exists alertas_comerciais_chave_viva_idx
  on public.alertas_comerciais (chave) where status in ('aberto', 'reconhecido', 'silenciado');
create index if not exists alertas_comerciais_vend_idx on public.alertas_comerciais (vendedor_id, status);
create index if not exists alertas_comerciais_status_idx on public.alertas_comerciais (status, categoria, ultima_em desc);

create table if not exists public.alertas_comerciais_eventos (
  id bigserial primary key,
  alerta_id uuid not null references public.alertas_comerciais(id) on delete cascade,
  evento text not null,                           -- criado, repetido, reconhecido, resolvido, silenciado, reaberto
  dados jsonb not null default '{}'::jsonb,
  usuario_id uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists alertas_comerciais_eventos_idx on public.alertas_comerciais_eventos (alerta_id, criado_em);

-- ---------------------------------------------------------------------
-- Fotografias diárias dos indicadores (histórico, evolução e ranking)
create table if not exists public.performance_snapshots (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,                  -- último dia incluído na janela
  janela text not null check (janela in ('dia', 'semana', 'mes')),
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  setor text,
  pop_id uuid,
  metricas jsonb not null,
  scores jsonb not null,
  ipc numeric(5, 1),
  provisorio boolean not null default false,
  posicao integer,
  versao_regras text not null,
  criado_em timestamptz not null default now(),
  constraint performance_snapshots_uk unique (data_referencia, janela, vendedor_id)
);
create index if not exists performance_snapshots_vend_idx on public.performance_snapshots (vendedor_id, janela, data_referencia desc);

-- ---------------------------------------------------------------------
-- Metas além da meta mensal de vendas (que continua na tabela metas)
create table if not exists public.metas_performance (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('vendas', 'ativacoes', 'conversao', 'leads_trabalhados', 'followups',
                                     'tempo_resposta', 'receita_nova', 'ticket_medio',
                                     'qualidade_atendimento', 'esforco', 'ipc')),
  escopo text not null check (escopo in ('global', 'unidade', 'equipe', 'funcao', 'vendedor')),
  referencia text,                                -- pop_id | usuario do coordenador | setor | vendedor_id
  periodicidade text not null check (periodicidade in ('dia', 'semana', 'mes')),
  inicio date not null,
  fim date not null,
  valor numeric(12, 2) not null,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint metas_performance_periodo_ck check (fim >= inicio)
);
create index if not exists metas_performance_idx on public.metas_performance (tipo, escopo, inicio);

-- ---------------------------------------------------------------------
-- Afastamentos/folgas formalizados (metas proporcionais à disponibilidade)
create table if not exists public.indisponibilidades_vendedor (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  inicio date not null,
  fim date not null,
  tipo text not null check (tipo in ('ferias', 'folga', 'afastamento', 'treinamento', 'outro')),
  observacao text,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint indisponibilidades_periodo_ck check (fim >= inicio)
);
create index if not exists indisponibilidades_vendedor_idx on public.indisponibilidades_vendedor (vendedor_id, inicio);

-- data de admissão (vendedores recém-contratados ficam "em rampa")
alter table public.vendedores add column if not exists admitido_em date;

-- ---------------------------------------------------------------------
-- Configuração comercial (PRD 7.2) — chave "performance" guarda pesos,
-- SLA, expediente, limites e parâmetros de IA; o código mescla com padrões
create table if not exists public.config_comercial (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id) on delete set null
);

-- trilha de auditoria do módulo (configurações, metas, alertas, acessos sensíveis)
create table if not exists public.auditoria_performance (
  id bigserial primary key,
  usuario_id uuid references public.usuarios(id) on delete set null,
  acao text not null,
  alvo text,
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_performance_idx on public.auditoria_performance (criado_em desc);

-- ---------------------------------------------------------------------
-- RLS ligada, sem policies (somente service role)
alter table public.conversas_atendimento enable row level security;
alter table public.conversas_mensagens enable row level security;
alter table public.analises_conversa enable row level security;
alter table public.analise_runs enable row level security;
alter table public.followups enable row level security;
alter table public.followups_historico enable row level security;
alter table public.alertas_comerciais enable row level security;
alter table public.alertas_comerciais_eventos enable row level security;
alter table public.performance_snapshots enable row level security;
alter table public.metas_performance enable row level security;
alter table public.indisponibilidades_vendedor enable row level security;
alter table public.config_comercial enable row level security;
alter table public.auditoria_performance enable row level security;
