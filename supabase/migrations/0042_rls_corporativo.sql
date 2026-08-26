-- 0042: escopo de dados do agente corporativo = mesmo das vendedoras
-- (ve apenas o que e dele: vendedor_id = vendedor_atual()).
create or replace function app.eh_vendedora() returns boolean
language sql stable as $$
  select app.perfil() in ('vendedora', 'vendedora_externa', 'agente_corporativo')
$$;

create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid) returns boolean
language sql stable as $$
  select case
    when app.perfil() = 'gestor'     then true
    when app.perfil() = 'supervisor' then p_vendedor_id is not null and app.agente_sob_coord(p_vendedor_id)
    when app.perfil() in ('vendedora','vendedora_externa','agente_corporativo')
      then p_vendedor_id = app.vendedor_atual()
    else false
  end
$$;
