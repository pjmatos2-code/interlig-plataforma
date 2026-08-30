-- 0057: o Setor de Atendimento passa a operar o CRM.
--
-- As agentes vão abrir tickets à mão (sem vínculo com o SZ Chat, que atende o
-- comercial). O acesso ao CRM estava amarrado a app.eh_vendedora(), e incluir
-- 'agente_atendimento' ali as jogaria também nos fluxos comerciais — ranking,
-- distribuição de leads, comissão de venda. Por isso a régua do CRM ganha
-- função própria: quem OPERA o CRM não é o mesmo conjunto de quem VENDE.
create or replace function app.opera_crm() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.ativo
       and u.perfil in ('vendedora', 'vendedora_externa', 'agente_corporativo', 'agente_atendimento')
   ) $$;

comment on function app.opera_crm() is
  'Perfis que trabalham tickets. Diferente de app.eh_vendedora(), que responde por quem vende (ranking, metas, comissão de venda).';

-- a agente de atendimento enxerga e trabalha os próprios tickets
drop policy if exists tickets_sel_atendimento on tickets;
create policy tickets_sel_atendimento on tickets for select to authenticated
  using (app.eh_agente_atendimento() and vendedor_id = app.vendedor_atual());

drop policy if exists tickets_ins_atendimento on tickets;
create policy tickets_ins_atendimento on tickets for insert to authenticated
  with check (app.eh_agente_atendimento() and vendedor_id = app.vendedor_atual());

drop policy if exists tickets_upd_atendimento on tickets;
create policy tickets_upd_atendimento on tickets for update to authenticated
  using (app.eh_agente_atendimento() and vendedor_id = app.vendedor_atual())
  with check (app.eh_agente_atendimento() and vendedor_id = app.vendedor_atual());

-- histórico e anotações do próprio ticket
drop policy if exists ticket_eventos_atendimento on ticket_eventos;
create policy ticket_eventos_atendimento on ticket_eventos for select to authenticated
  using (
    app.eh_agente_atendimento()
    and exists (
      select 1 from tickets t
      where t.id = ticket_eventos.ticket_id and t.vendedor_id = app.vendedor_atual()
    )
  );

drop policy if exists ticket_eventos_ins_atendimento on ticket_eventos;
create policy ticket_eventos_ins_atendimento on ticket_eventos for insert to authenticated
  with check (
    app.eh_agente_atendimento()
    and exists (
      select 1 from tickets t
      where t.id = ticket_eventos.ticket_id and t.vendedor_id = app.vendedor_atual()
    )
  );

-- cadastros de apoio que a tela do CRM lê
drop policy if exists motivos_sel_atendimento on motivos_nao_conversao;
create policy motivos_sel_atendimento on motivos_nao_conversao for select to authenticated
  using (true);
