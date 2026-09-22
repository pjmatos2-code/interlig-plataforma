-- =====================================================================
-- 0093: metas das vendedoras do POP visíveis ao coordenador (22/09/2026).
--
-- O painel por vendedora mostrava "sem meta" para o coordenador de
-- unidade: metas de vendedora só apareciam para quem as coordena
-- (agente_sob_coord). Mesma união do escopo geral: POP ∪ coordenadas,
-- com avaliação única por consulta (padrão 0091).
-- =====================================================================

drop policy if exists metas_sel on metas;
create policy metas_sel on metas for select to authenticated using (
  (select app.eh_gestor())
  or escopo = 'global'
  or (escopo = 'pop' and referencia_id = (select app.pop_atual()))
  or (escopo = 'vendedora' and (
    referencia_id = (select app.vendedor_atual())
    or ((select app.eh_supervisor()) and (
      referencia_id in (select app.vendedores_coordenados())
      or referencia_id in (select v.id from vendedores v where v.pop_id = (select app.pop_atual()))
    ))
  ))
);
