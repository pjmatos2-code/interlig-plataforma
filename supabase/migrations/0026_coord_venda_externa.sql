-- 0026: exceção da Venda Externa — o coordenador é dono da operação PAP inteira.
-- Todo ticket de venda externa (que tem visita_externa vinculada) é visível e
-- editável por qualquer coordenador (perfil supervisor), independentemente de a
-- agente estar atribuída a ele. Nos demais módulos vale o escopo por agente (0025).

drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated
  using (
    app.no_escopo(pop_id, vendedor_id)
    or (vendedor_id is null and app.eh_gestor())
    -- Venda Externa: coordenador vê todos os tickets de PAP
    or (app.eh_supervisor() and exists (
          select 1 from visitas_externas ve where ve.ticket_id = tickets.id))
  );

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated
  using (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_supervisor() and exists (
          select 1 from visitas_externas ve where ve.ticket_id = tickets.id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  )
  with check (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_supervisor() and exists (
          select 1 from visitas_externas ve where ve.ticket_id = tickets.id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );
