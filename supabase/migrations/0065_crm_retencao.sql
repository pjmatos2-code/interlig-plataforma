-- 0065: a agente de retenção também opera o CRM.
--
-- Mesmo desenho do 0057 (atendimento): tickets manuais dos próprios casos —
-- agendamento de retorno, follow-up de retenção — sem vínculo com o SZ Chat
-- comercial e sem entrar em ranking/distribuição de leads.
create or replace function app.opera_crm() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.ativo
       and u.perfil in ('vendedora', 'vendedora_externa', 'agente_corporativo', 'agente_atendimento', 'agente_retencao')
   ) $$;

-- a agente de retenção enxerga e trabalha os próprios tickets
drop policy if exists tickets_sel_retencao on tickets;
create policy tickets_sel_retencao on tickets for select to authenticated
  using (app.eh_agente_retencao() and vendedor_id = app.vendedor_atual());

drop policy if exists tickets_ins_retencao on tickets;
create policy tickets_ins_retencao on tickets for insert to authenticated
  with check (app.eh_agente_retencao() and vendedor_id = app.vendedor_atual());

drop policy if exists tickets_upd_retencao on tickets;
create policy tickets_upd_retencao on tickets for update to authenticated
  using (app.eh_agente_retencao() and vendedor_id = app.vendedor_atual())
  with check (app.eh_agente_retencao() and vendedor_id = app.vendedor_atual());

drop policy if exists ticket_eventos_retencao on ticket_eventos;
create policy ticket_eventos_retencao on ticket_eventos for select to authenticated
  using (
    app.eh_agente_retencao()
    and exists (
      select 1 from tickets t
      where t.id = ticket_eventos.ticket_id and t.vendedor_id = app.vendedor_atual()
    )
  );

drop policy if exists ticket_eventos_ins_retencao on ticket_eventos;
create policy ticket_eventos_ins_retencao on ticket_eventos for insert to authenticated
  with check (
    app.eh_agente_retencao()
    and exists (
      select 1 from tickets t
      where t.id = ticket_eventos.ticket_id and t.vendedor_id = app.vendedor_atual()
    )
  );
