-- =====================================================================
-- 0030: Notificações in-app (sininho). Dois eventos:
--   - novo_ticket: card novo no CRM (manual, PAP/venda externa, robô SZ)
--   - nova_venda : contrato atribuído a uma vendedora (mantém o ranking vivo)
-- Destinatários (regra do gestor 24/08):
--   - a vendedora RESPONSÁVEL (só as dela)
--   - o COORDENADOR da equipe dela (agentes sob ele; ex.: registro de visita)
--   - o ADMINISTRADOR (gestor) recebe TODAS
-- =====================================================================
create table if not exists notificacoes (
  id             uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references usuarios(id) on delete cascade,
  tipo           text not null,               -- 'novo_ticket' | 'nova_venda'
  titulo         text not null,
  descricao      text,
  link           text,
  lida           boolean not null default false,
  criado_em      timestamptz not null default now()
);
create index if not exists notificacoes_dest_idx on notificacoes (destinatario_id, criado_em desc);
create index if not exists notificacoes_naolida_idx on notificacoes (destinatario_id) where not lida;

alter table notificacoes enable row level security;
-- cada um só vê e marca como lida as próprias
drop policy if exists notif_sel on notificacoes;
create policy notif_sel on notificacoes for select to authenticated
  using (destinatario_id = auth.uid());
drop policy if exists notif_upd on notificacoes;
create policy notif_upd on notificacoes for update to authenticated
  using (destinatario_id = auth.uid()) with check (destinatario_id = auth.uid());

-- fan-out (SECURITY DEFINER: insere para os destinatários certos, sem RLS)
create or replace function app.notificar(
  p_tipo text, p_vendedor_id uuid, p_titulo text, p_descricao text, p_link text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select distinct u.id
    from usuarios u
    where u.ativo and (
      u.perfil = 'gestor'
      or (p_vendedor_id is not null and u.vendedor_id = p_vendedor_id)
      or (p_vendedor_id is not null
          and u.id = (select v.coordenador_id from vendedores v where v.id = p_vendedor_id))
    )
  loop
    insert into notificacoes(destinatario_id, tipo, titulo, descricao, link)
    values (r.id, p_tipo, p_titulo, p_descricao, p_link);
  end loop;
end $$;

-- gatilho: novo ticket no CRM
create or replace function app.notif_novo_ticket() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare vend text;
begin
  select nome into vend from vendedores where id = new.vendedor_id;
  perform app.notificar(
    'novo_ticket', new.vendedor_id,
    '🎫 Novo ticket no CRM',
    coalesce(new.cliente_nome, 'Cliente')
      || coalesce(' · ' || vend, ' · não atribuído')
      || case when new.origem_criacao = 'sz_auto' then ' · SZ' else '' end,
    '/crm/' || new.id::text
  );
  return new;
end $$;
drop trigger if exists tickets_notifica on tickets;
create trigger tickets_notifica after insert on tickets
  for each row execute function app.notif_novo_ticket();

-- gatilho: contrato atribuído (nova venda)
create or replace function app.notif_nova_venda() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare vend text; cli text; pl text;
begin
  select nome into vend from vendedores where id = new.vendedor_id;
  select nome into cli  from clientes   where id = new.cliente_id;
  select nome into pl   from planos     where id = new.plano_id;
  perform app.notificar(
    'nova_venda', new.vendedor_id,
    '💰 Nova venda atribuída',
    coalesce(cli, 'Cliente') || coalesce(' · ' || pl, '') || coalesce(' · ' || vend, ''),
    '/vendedoras/' || new.vendedor_id::text
  );
  return new;
end $$;
drop trigger if exists contratos_notifica_ins on contratos;
create trigger contratos_notifica_ins after insert on contratos
  for each row when (new.vendedor_id is not null)
  execute function app.notif_nova_venda();
drop trigger if exists contratos_notifica_upd on contratos;
create trigger contratos_notifica_upd after update on contratos
  for each row when (new.vendedor_id is not null and new.vendedor_id is distinct from old.vendedor_id)
  execute function app.notif_nova_venda();
