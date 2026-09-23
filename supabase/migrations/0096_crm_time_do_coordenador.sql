-- =====================================================================
-- 0096: CRM do coordenador de TIME só com as vendedoras dele (23/09/2026).
--
-- Pedido do gestor: no CRM, o coordenador vê somente os tickets das suas
-- vendedoras — o Marcelo (coordenador da venda externa) via o CRM inteiro
-- de Altamira depois do escopo por POP (0088).
--
-- Regra: supervisor que COORDENA vendedoras (vendedores.coordenador_id)
-- tem o CRM do time (tickets das coordenadas + visitas externas delas);
-- supervisor de unidade (não coordena ninguém) segue com o CRM do POP.
-- Vale só para TICKETS — esteira/dashboard/contratos ficam como estão.
-- =====================================================================

create or replace function app.coordena_time()
returns boolean
language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from vendedores where coordenador_id = auth.uid() and ativo)
$$;
comment on function app.coordena_time() is
  'Usuário coordena pelo menos uma vendedora ativa (coordenador de TIME, ex.: venda externa).';

drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        ((select app.coordena_time()) and (
          vendedor_id in (select app.vendedores_coordenados())
          or id in (select app.tickets_externa_coordenados())
        ))
        or (not (select app.coordena_time()) and pop_id = (select app.pop_atual()))
      ))
  or ((select app.perfil()) in ('vendedora', 'vendedora_externa', 'agente_corporativo')
      and vendedor_id = (select app.vendedor_atual()))
);

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        ((select app.coordena_time()) and (
          vendedor_id in (select app.vendedores_coordenados())
          or id in (select app.tickets_externa_coordenados())
        ))
        or (not (select app.coordena_time()) and pop_id = (select app.pop_atual()))
      ))
  or ((select app.eh_vendedora()) and vendedor_id = (select app.vendedor_atual()))
);
