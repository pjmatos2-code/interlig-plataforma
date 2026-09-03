-- 0078: registrar proposta vale para TODO perfil que opera o CRM.
--
-- A política de insert em ticket_propostas (0008) só admitia gestor,
-- supervisor e vendedoras — as agentes de refidelização (atendimento) e
-- retenção ganharam CRM depois (0057/0065) e esbarravam em RLS ao registrar
-- proposta ("new row violates row-level security policy"). Mesma regra de
-- escopo dos tickets: a agente registra proposta nos tickets dela.

drop policy if exists propostas_ins on ticket_propostas;
create policy propostas_ins on ticket_propostas for insert to authenticated
  with check (
    criado_por is not distinct from auth.uid()
    and exists (
      select 1 from tickets t
      where t.id = ticket_propostas.ticket_id
        and (
          app.eh_gestor()
          or (app.eh_supervisor() and (t.pop_id is not distinct from app.pop_atual() or t.vendedor_id is null))
          or (app.opera_crm() and t.vendedor_id is not distinct from app.vendedor_atual())
        )
    )
  );
