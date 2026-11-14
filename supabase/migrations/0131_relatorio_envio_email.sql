-- =====================================================================
-- 0131: envio do Relatório Comercial Semanal por e-mail (04/11/2026).
--
-- Pedido do Paulo: o relatório vai em PDF, anexado a um e-mail com o
-- resumo no corpo (modelo do print do e-mail ao CEO), enviado pela caixa
-- corporativa dele (Locaweb) — na hora, pelo botão, e toda segunda.
--
-- integracoes_config ganha dois "sistemas":
--   'email'              a caixa que envia (usuário, senha, servidor);
--   'relatorio_semanal'  destinatários, nome da abertura e o envio
--                        automático de segunda.
--
-- relatorios_envios guarda cada envio (para quem, se foi com PDF, se foi
-- automático, o erro). O automático de segunda olha aqui para não mandar
-- duas vezes a mesma semana. Só a service role lê (RLS sem política).
-- =====================================================================

alter table public.integracoes_config drop constraint if exists integracoes_config_sistema_check;
alter table public.integracoes_config add constraint integracoes_config_sistema_check
  check (sistema in ('sgp', 'szchat', 'site', 'anthropic', 'politica_credito', 'interchat', 'email', 'relatorio_semanal'));

create table if not exists public.relatorios_envios (
  id            uuid primary key default gen_random_uuid(),
  relatorio_id  uuid not null references public.relatorios_semanais(id) on delete cascade,
  para          text[] not null,
  assunto       text not null,
  enviado       boolean not null default true,
  automatico    boolean not null default false,
  enviado_em    timestamptz not null default now(),
  enviado_por   uuid references public.usuarios(id) on delete set null,
  erro          text,
  message_id    text
);

create index if not exists relatorios_envios_relatorio on public.relatorios_envios (relatorio_id, enviado_em desc);

alter table public.relatorios_envios enable row level security;

comment on table public.relatorios_envios is
  'Envios do Relatório Comercial Semanal por e-mail (manual e automático de segunda). enviado = false: não saiu (erro diz por quê); enviado com erro: saiu com aviso (destinatário recusado). Sempre com o PDF: sem ele não sai. Só a service role lê.';

notify pgrst, 'reload schema';
