-- =====================================================================
-- Migração 0008: propostas/produtos do ticket + valor da negociação
-- (padrão RD Station que as agentes conhecem)
-- =====================================================================

-- valor estimado da negociação (aparece no card e soma por coluna do kanban)
alter table tickets add column if not exists valor_estimado numeric(10,2);

create table ticket_propostas (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references tickets(id) on delete restrict,
  plano_id    uuid references planos(id) on delete set null,
  descricao   text,                    -- produto/plano em texto livre (fallback)
  valor       numeric(10,2) not null,
  observacao  text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references usuarios(id) on delete set null
);

create index ticket_propostas_idx on ticket_propostas (ticket_id, criado_em desc);

alter table ticket_propostas enable row level security;

-- visível para quem enxerga o ticket
create policy propostas_sel on ticket_propostas for select to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_propostas.ticket_id));

-- cria proposta em ticket que a pessoa pode tratar (mesma regra de escopo)
create policy propostas_ins on ticket_propostas for insert to authenticated
  with check (
    criado_por is not distinct from auth.uid()
    and exists (
      select 1 from tickets t
      where t.id = ticket_propostas.ticket_id
        and (
          app.eh_gestor()
          or (app.eh_supervisor() and (t.pop_id is not distinct from app.pop_atual() or t.vendedor_id is null))
          or (app.eh_vendedora() and t.vendedor_id is not distinct from app.vendedor_atual())
        )
    )
  );

-- a proposta é registro histórico: nunca some nem muda
create trigger propostas_sem_delete before delete on ticket_propostas
  for each row execute function app.bloqueia_exclusao();
create trigger propostas_sem_update before update on ticket_propostas
  for each row execute function app.bloqueia_exclusao();
