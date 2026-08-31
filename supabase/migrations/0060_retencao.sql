-- 0060: módulo Retenção — casos, setor e perfil.
--
-- Desenho aprovado pela gestão em 30/08/2026, validado com 3 meses de dados
-- auditados (jun/jul/ago) e o export completo das conversas do canal:
--  · caso nasce do canal SZ "Cancelamento Altamira" (robô) ou manual (loja/tel)
--  · o agente registra dor, alçada e tratativa; o DESFECHO é carimbo do SGP:
--    ativo no fechamento → retido; ocorrência de cancelamento → perdido;
--    suspenso → em risco (reativou paga retroativo, cancelou vira perdido)
--  · irreversível (mudança/inviabilidade) exige motivo e não penaliza a taxa
--  · clawback: retido que cancela em ≤30 dias estorna na competência seguinte
--  · comissão por TAXA de retenção (retidos ÷ elegíveis), não por quantidade

alter type perfil_usuario add value if not exists 'agente_retencao';

alter table vendedores drop constraint if exists vendedores_setor_check;
alter table vendedores add constraint vendedores_setor_check
  check (setor in ('comercial_interno', 'comercial_externo', 'atendimento', 'corporativo', 'retencao'));

create table if not exists casos_retencao (
  id                 uuid primary key default gen_random_uuid(),
  origem             text not null default 'manual' check (origem in ('sz_auto', 'manual', 'importado_rd')),
  protocolo_sz       text,
  telefone           text,
  cliente_nome       text not null,
  contrato_id        uuid references contratos(id) on delete set null,
  sgp_contrato_id    text,
  valor_mensal       numeric(12,2) default 0,      -- VTV (valor de tabela do plano)
  agente_login       text,                          -- login SGP da agente responsável
  etapa              text not null default 'novo'
    check (etapa in ('novo', 'negociacao', 'validacao', 'fechado')),
  -- desfecho: os dois primeiros são CARIMBO da auditoria, nunca da agente
  desfecho           text
    check (desfecho in ('retido', 'perdido', 'em_risco', 'irreversivel', 'transferido', 'sem_resposta')),
  desfecho_em        timestamptz,
  desfecho_auto      boolean not null default false, -- true = carimbado pela auditoria
  -- o que a agente registra (POP RET-001)
  trilha             text check (trilha in ('A', 'B', 'C', 'D', 'E', 'F')),
  motivo_declarado   text,
  alcada_usada       text,                           -- F1..F4 ou descrição da oferta
  resumo             text,
  irreversivel_motivo text,
  -- reincidência (por telefone — apelidos de WhatsApp não são confiáveis)
  reincidente_de     uuid references casos_retencao(id) on delete set null,
  -- clawback
  clawback_em        timestamptz,
  clawback_motivo    text,
  -- análise de conversa (IA): {motivo_real, oferta, aderencia, divergencia, resumo}
  analise            jsonb,
  analisado_em       timestamptz,
  criado_por         uuid references usuarios(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);

create index if not exists idx_casos_ret_data on casos_retencao (criado_em);
create index if not exists idx_casos_ret_agente on casos_retencao (agente_login, criado_em);
create index if not exists idx_casos_ret_tel on casos_retencao (telefone);
create unique index if not exists idx_casos_ret_protocolo on casos_retencao (protocolo_sz)
  where protocolo_sz is not null;

alter table casos_retencao enable row level security;

create policy casos_ret_adm on casos_retencao for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());
