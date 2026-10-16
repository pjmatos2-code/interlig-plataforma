-- 0118: configuração do InterChat (chaves VAPID das notificações) junto das
-- outras integrações.
alter table public.integracoes_config drop constraint if exists integracoes_config_sistema_check;
alter table public.integracoes_config add constraint integracoes_config_sistema_check
  check (sistema = any (array['sgp', 'szchat', 'site', 'anthropic', 'politica_credito', 'interchat']));
