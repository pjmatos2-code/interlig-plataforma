-- 0146: lembrete do CRM com confirmação de leitura (23/11/2026).
--
-- Quando a ação agendada no ticket vence, a responsável recebe um aviso fixo
-- na tela (não some sozinho) e confirma com "Ciente" ou adia 10 minutos. O
-- coordenador e o administrador seguem recebendo só no sino e veem no ticket
-- se o aviso foi confirmado, por quem e quando.

-- (1) notificação que exige confirmação
alter table public.notificacoes add column if not exists ref_id uuid;
alter table public.notificacoes add column if not exists confirmar boolean not null default false;
alter table public.notificacoes add column if not exists confirmada_em timestamptz;
alter table public.notificacoes add column if not exists adiada_ate timestamptz;
comment on column public.notificacoes.ref_id is 'Registro de origem (no lembrete: ticket_acoes.id).';
comment on column public.notificacoes.confirmar is 'Abre o aviso fixo na tela até a pessoa confirmar a leitura.';
create index if not exists notificacoes_a_confirmar_idx on public.notificacoes (destinatario_id)
  where confirmar and confirmada_em is null;

-- (2) recibo no próprio lembrete do ticket
alter table public.ticket_acoes add column if not exists confirmada_em timestamptz;
alter table public.ticket_acoes add column if not exists confirmada_por uuid references public.usuarios(id);
comment on column public.ticket_acoes.confirmada_em is 'Quando a responsável confirmou ter visto o aviso do lembrete.';

notify pgrst, 'reload schema';
