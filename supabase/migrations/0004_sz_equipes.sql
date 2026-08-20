-- =====================================================================
-- Migração 0004: equipes habilitadas do SZ Chat (docs/decisoes.md D1)
-- Só conversas direcionadas a uma Equipe comercial HABILITADA geram ticket
-- automático; as demais são ignoradas (com log). Gestor administra.
-- =====================================================================

create table sz_equipes_habilitadas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique,     -- nome exato da Equipe no SZ Chat
  pop_id     uuid references pops(id) on delete set null,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

alter table sz_equipes_habilitadas enable row level security;

create policy sz_equipes_sel on sz_equipes_habilitadas for select to authenticated
  using (app.eh_gestor() or app.eh_supervisor());
create policy sz_equipes_adm on sz_equipes_habilitadas for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- Exemplo de configuração (praças do seed). Na operação real o gestor cadastra
-- "Comercial Altamira", "Comercial Brasil Novo" etc. no admin.
insert into sz_equipes_habilitadas (nome, pop_id, ativo)
select 'Comercial ' || p.cidade, p.id, true from pops p
on conflict (nome) do nothing;
