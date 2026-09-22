-- =====================================================================
-- 0092: títulos (faturas) no escopo do coordenador de unidade (22/09/2026).
--
-- A policy antiga só liberava títulos de vendedoras SOB COORDENAÇÃO — o
-- coordenador de POP via a Qualidade zerada (0 títulos ⇒ inadimplência
-- vazia). Mesmo padrão rápido do 0091: o IN reaproveita a policy barata
-- de contratos (POP ∪ coordenadas), hasheada uma vez por consulta.
-- =====================================================================

drop policy if exists titulos_sel on titulos;
create policy titulos_sel on titulos for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor'
      and contrato_id in (select c.id from contratos c))
);

drop policy if exists titulos_sel_direcao on titulos;
create policy titulos_sel_direcao on titulos for select to authenticated
  using ((select app.eh_direcao()));
