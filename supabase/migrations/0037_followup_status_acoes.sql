-- 0037: (1) status do follow-up pendente — a vendedora marca como FEITO e
-- registra o retorno obtido; (2) ações agendadas do ticket ("ligar amanhã às
-- 10:00") com lembrete/notificação na data e hora marcadas.

-- status do follow-up (o painel filtra por urgencia not null; concluir zera a
-- urgência e carimba quando foi feito)
alter table tickets add column if not exists followup_feito_em timestamptz;

-- ações agendadas do ticket
create table if not exists ticket_acoes (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references tickets(id) on delete cascade,
  descricao     text not null,
  quando        timestamptz not null,
  criado_por    uuid references usuarios(id),
  criado_em     timestamptz not null default now(),
  concluida_em  timestamptz,
  notificado_em timestamptz
);
create index if not exists ticket_acoes_ticket_idx on ticket_acoes (ticket_id, quando);
create index if not exists ticket_acoes_devidas_idx on ticket_acoes (quando)
  where notificado_em is null and concluida_em is null;

alter table ticket_acoes enable row level security;
-- visível/editável por quem enxerga o ticket (mesma lógica dos eventos)
drop policy if exists acoes_sel on ticket_acoes;
create policy acoes_sel on ticket_acoes for select to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_acoes.ticket_id));
drop policy if exists acoes_ins on ticket_acoes;
create policy acoes_ins on ticket_acoes for insert to authenticated
  with check (
    criado_por is not distinct from auth.uid()
    and exists (select 1 from tickets t where t.id = ticket_acoes.ticket_id)
  );
drop policy if exists acoes_upd on ticket_acoes;
create policy acoes_upd on ticket_acoes for update to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_acoes.ticket_id))
  with check (exists (select 1 from tickets t where t.id = ticket_acoes.ticket_id));
