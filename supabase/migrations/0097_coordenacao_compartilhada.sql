-- =====================================================================
-- 0097: dois coordenadores para o mesmo time (23/09/2026).
--
-- A Rayssa é a SEGUNDA coordenadora da venda externa — mesma visão do
-- Marcelo. vendedores.coordenador_id comporta um único coordenador, então
-- a co-coordenação vive numa tabela própria e as funções de escopo passam
-- a considerar a UNIÃO (coordenador_id ∪ coordenadores_extras).
-- =====================================================================

create table if not exists coordenadores_extras (
  usuario_id  uuid not null references usuarios(id) on delete cascade,
  vendedor_id uuid not null references vendedores(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (usuario_id, vendedor_id)
);
comment on table coordenadores_extras is
  'Co-coordenação: usuário (supervisor) que também coordena a vendedora, além do vendedores.coordenador_id.';

alter table coordenadores_extras enable row level security;
drop policy if exists coordenadores_extras_sel on coordenadores_extras;
create policy coordenadores_extras_sel on coordenadores_extras for select to authenticated using (true);

-- funções de escopo passam a unir as duas fontes
create or replace function app.vendedores_coordenados()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select id from vendedores where coordenador_id = auth.uid()
  union
  select vendedor_id from coordenadores_extras where usuario_id = auth.uid()
$$;

create or replace function app.agente_sob_coord(p_vendedor_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from vendedores v
    where v.id = p_vendedor_id and v.coordenador_id = auth.uid()
  ) or exists (
    select 1 from coordenadores_extras ce
    where ce.vendedor_id = p_vendedor_id and ce.usuario_id = auth.uid()
  )
$$;

create or replace function app.tickets_externa_coordenados()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select ve.ticket_id
  from visitas_externas ve
  where ve.vendedor_id in (select app.vendedores_coordenados())
$$;

create or replace function app.coordena_time()
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from vendedores where coordenador_id = auth.uid() and ativo)
      or exists (
        select 1 from coordenadores_extras ce
        join vendedores v on v.id = ce.vendedor_id
        where ce.usuario_id = auth.uid() and v.ativo
      )
$$;
