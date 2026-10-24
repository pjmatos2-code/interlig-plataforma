-- 0123 — Performance Comercial: mensagens do cliente por dia (24/10/2026). Aditiva.
-- Permite filtrar "mensagens recebidas" exatamente por dia/semana/mês.
alter table public.conversas_atendimento
  add column if not exists cliente_por_dia jsonb not null default '{}'::jsonb;
