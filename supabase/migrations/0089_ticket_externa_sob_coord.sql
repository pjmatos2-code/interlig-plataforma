-- =====================================================================
-- 0089: venda externa no CRM só para o coordenador DO TIME (21/09/2026).
--
-- A cláusula antiga dava a QUALQUER supervisor todos os tickets com visita
-- de venda externa, de qualquer POP — pensada quando o único supervisor era
-- o Marcelo. Com coordenadores de unidade (Railson/VTX, Aline/BN), isso
-- vazava o PAP de Altamira para as outras unidades.
--
-- Agora o ticket de venda externa aparece para o supervisor quando:
--   • a visita é de uma vendedora QUE ELE COORDENA (Marcelo segue igual); ou
--   • o ticket é do POP dele (já coberto por app.no_escopo).
-- =====================================================================

create or replace function app.ticket_externa_sob_coord(p_ticket_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from visitas_externas ve
    join vendedores v on v.id = ve.vendedor_id
    where ve.ticket_id = p_ticket_id
      and v.coordenador_id = auth.uid()
  )
$$;

comment on function app.ticket_externa_sob_coord(uuid) is
  'Ticket tem visita de venda externa feita por vendedora coordenada pelo usuário logado.';

drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated using (
  app.no_escopo(pop_id, vendedor_id)
  or (vendedor_id is null and app.eh_gestor())
  or (app.eh_supervisor() and app.ticket_externa_sob_coord(id))
);

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated using (
  app.eh_gestor()
  or (app.eh_supervisor() and (
    pop_id = app.pop_atual()
    or app.agente_sob_coord(vendedor_id)
    or app.ticket_externa_sob_coord(id)
  ))
  or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
);
