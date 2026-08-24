-- 0023: escopo de dados inclui vendedora_externa (mesmo escopo da vendedora)
create or replace function app.eh_vendedora() returns boolean
language sql stable as $$ select app.perfil() in ('vendedora', 'vendedora_externa') $$;

create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid) returns boolean
language sql stable as $$
  select case
    when app.perfil() = 'gestor'     then true
    when app.perfil() = 'supervisor' then p_pop_id = app.pop_atual()
    when app.perfil() in ('vendedora','vendedora_externa') then p_vendedor_id = app.vendedor_atual()
    else false
  end
$$;
