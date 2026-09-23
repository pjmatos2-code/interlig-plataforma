-- =====================================================================
-- 0095: Esteira para o gestor técnico (23/09/2026).
--
-- Ele acompanha o fluxo das instalações (assinatura → OS → ativação),
-- então precisa LER contratos e clientes — sem acesso a tickets,
-- comissões ou faturas. Leitura ampla (as 3 unidades), como no módulo
-- técnico. Padrão de avaliação única por consulta (0091).
-- =====================================================================

drop policy if exists contratos_sel_tecnico on contratos;
create policy contratos_sel_tecnico on contratos for select to authenticated
  using ((select app.perfil()) = 'gestor_tecnico');

drop policy if exists clientes_sel_tecnico on clientes;
create policy clientes_sel_tecnico on clientes for select to authenticated
  using ((select app.perfil()) = 'gestor_tecnico');
