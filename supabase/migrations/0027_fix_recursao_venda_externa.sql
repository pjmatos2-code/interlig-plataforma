-- 0027: corrige recursão infinita entre tickets e visitas_externas.
-- A política tickets_sel (0026) fazia EXISTS em visitas_externas, cuja política
-- visitas_sel faz EXISTS em tickets -> recursão. A checagem passa a ser feita por
-- função SECURITY DEFINER (roda como owner, sem disparar a RLS de visitas_externas).
create or replace function app.ticket_eh_venda_externa(p_ticket_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from visitas_externas ve where ve.ticket_id = p_ticket_id)
$$;
grant execute on function app.ticket_eh_venda_externa(uuid) to authenticated;

drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated
  using (
    app.no_escopo(pop_id, vendedor_id)
    or (vendedor_id is null and app.eh_gestor())
    or (app.eh_supervisor() and app.ticket_eh_venda_externa(tickets.id))
  );

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated
  using (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_supervisor() and app.ticket_eh_venda_externa(tickets.id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  )
  with check (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_supervisor() and app.ticket_eh_venda_externa(tickets.id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );
