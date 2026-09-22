-- =====================================================================
-- 0090: RLS do coordenador sem timeout (22/09/2026).
--
-- O escopo por POP (0088) chamava app.pop_atual()/app.perfil() — funções
-- SECURITY DEFINER, não inlináveis — LINHA A LINHA em cada tabela da
-- consulta. Nos joins da esteira/CRM (contratos × clientes × vendedores)
-- isso virava dezenas de milhares de subconsultas: statement timeout e
-- tela vazia para o supervisor.
--
-- Correção (padrão Supabase): embrulhar as funções em subconsulta escalar
-- `(select f())` — o Postgres avalia UMA vez por consulta (InitPlan) e
-- reaproveita o valor em todas as linhas.
-- =====================================================================

create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid)
returns boolean
language sql stable as $$
  select case (select app.perfil())
    when 'gestor' then true
    when 'supervisor' then
      (p_pop_id is not null and p_pop_id = (select app.pop_atual()))
      or (p_vendedor_id is not null and app.agente_sob_coord(p_vendedor_id))
    when 'vendedora'          then p_vendedor_id = (select app.vendedor_atual())
    when 'vendedora_externa'  then p_vendedor_id = (select app.vendedor_atual())
    when 'agente_corporativo' then p_vendedor_id = (select app.vendedor_atual())
    else false
  end
$$;

comment on function app.no_escopo(uuid, uuid) is
  'Escopo de leitura (gestor tudo; supervisor = POP ∪ coordenadas; vendedora só o dela). Perfil/POP avaliados uma vez por consulta (InitPlan).';

-- mesmas chamadas nas policies de tickets: uma avaliação por consulta
drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated using (
  app.no_escopo(pop_id, vendedor_id)
  or (vendedor_id is null and (select app.eh_gestor()))
  or ((select app.eh_supervisor()) and app.ticket_externa_sob_coord(id))
);

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated using (
  (select app.eh_gestor())
  or ((select app.eh_supervisor()) and (
    pop_id = (select app.pop_atual())
    or app.agente_sob_coord(vendedor_id)
    or app.ticket_externa_sob_coord(id)
  ))
  or ((select app.eh_vendedora()) and vendedor_id = (select app.vendedor_atual()))
);
