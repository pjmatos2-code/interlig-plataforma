-- =====================================================================
-- 0099: contratos do coordenador de TIME = só o time (23/09/2026).
--
-- O 0098 atualizou app.no_escopo, mas desde o 0091 a policy de contratos
-- usa a expressão INLINE (performance) e não passa pela função — o
-- Marcelo continuava vendo Altamira inteira no dashboard/esteira. Mesma
-- regra do CRM (0096), agora em contratos; clientes/títulos/comissões
-- acompanham pelos INs que reaproveitam esta policy.
-- =====================================================================

drop policy if exists contratos_sel on contratos;
create policy contratos_sel on contratos for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        ((select app.coordena_time())
          and vendedor_id in (select app.vendedores_coordenados()))
        or (not (select app.coordena_time())
          and pop_id = (select app.pop_atual()))
      ))
  or ((select app.perfil()) in ('vendedora', 'vendedora_externa', 'agente_corporativo')
      and vendedor_id = (select app.vendedor_atual()))
);
