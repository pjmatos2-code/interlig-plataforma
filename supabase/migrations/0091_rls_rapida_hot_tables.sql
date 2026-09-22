-- =====================================================================
-- 0091: RLS das tabelas quentes sem função por linha (22/09/2026).
--
-- O EXPLAIN da esteira do coordenador mostrou 6,2s: app.no_escopo era
-- chamada LINHA A LINHA (contratos 17k × 2 na policy de clientes ≈ 33k
-- execuções × ~0,17ms = 5,8s) e cada chamada faz 2-3 consultas internas
-- (perfil/pop/coordenação). O 0090 não bastou porque a função não é
-- inlinada — a subconsulta escalar dentro dela é replanejada por chamada.
--
-- Correção definitiva nas tabelas quentes (contratos, clientes, tickets,
-- comissao_liberacoes):
--   • perfil/pop/vendedor via `(select f())` DIRETO na policy → InitPlan,
--     uma avaliação por consulta;
--   • coordenação e venda externa via funções SECURITY DEFINER que
--     retornam CONJUNTOS (setof uuid) → subplan hasheado, uma execução
--     por consulta (e sem recursão tickets↔visitas_externas).
-- =====================================================================

-- conjuntos avaliados uma vez por consulta
create or replace function app.vendedores_coordenados()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select id from vendedores where coordenador_id = auth.uid()
$$;
comment on function app.vendedores_coordenados() is
  'Vendedoras coordenadas pelo usuário logado (para IN hasheado nas policies).';

create or replace function app.tickets_externa_coordenados()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp as $$
  select ve.ticket_id
  from visitas_externas ve
  join vendedores v on v.id = ve.vendedor_id
  where v.coordenador_id = auth.uid()
$$;
comment on function app.tickets_externa_coordenados() is
  'Tickets com visita de venda externa de vendedora coordenada pelo usuário (SD evita recursão de policy).';

-- ---------------- contratos ----------------
drop policy if exists contratos_sel on contratos;
create policy contratos_sel on contratos for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        pop_id = (select app.pop_atual())
        or vendedor_id in (select app.vendedores_coordenados())
      ))
  or ((select app.perfil()) in ('vendedora', 'vendedora_externa', 'agente_corporativo')
      and vendedor_id = (select app.vendedor_atual()))
);
drop policy if exists contratos_sel_direcao on contratos;
create policy contratos_sel_direcao on contratos for select to authenticated
  using ((select app.eh_direcao()));

-- ---------------- clientes ----------------
-- o IN reaproveita a policy (agora barata) de contratos: quem enxerga o
-- contrato enxerga o cliente
drop policy if exists clientes_sel on clientes;
create policy clientes_sel on clientes for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or id in (select c.cliente_id from contratos c)
);
drop policy if exists clientes_sel_direcao on clientes;
create policy clientes_sel_direcao on clientes for select to authenticated
  using ((select app.eh_direcao()));

-- ---------------- tickets ----------------
drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        pop_id = (select app.pop_atual())
        or vendedor_id in (select app.vendedores_coordenados())
        or id in (select app.tickets_externa_coordenados())
      ))
  or ((select app.perfil()) in ('vendedora', 'vendedora_externa', 'agente_corporativo')
      and vendedor_id = (select app.vendedor_atual()))
);
drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated using (
  (select app.perfil()) = 'gestor'
  or ((select app.perfil()) = 'supervisor' and (
        pop_id = (select app.pop_atual())
        or vendedor_id in (select app.vendedores_coordenados())
        or id in (select app.tickets_externa_coordenados())
      ))
  or ((select app.eh_vendedora()) and vendedor_id = (select app.vendedor_atual()))
);
drop policy if exists tickets_sel_direcao on tickets;
create policy tickets_sel_direcao on tickets for select to authenticated
  using ((select app.eh_direcao()));

-- ---------------- comissao_liberacoes ----------------
drop policy if exists comissao_liberacoes_sel on comissao_liberacoes;
create policy comissao_liberacoes_sel on comissao_liberacoes for select to authenticated using (
  contrato_id in (select c.id from contratos c)
);
drop policy if exists comissao_liberacoes_sel_direcao on comissao_liberacoes;
create policy comissao_liberacoes_sel_direcao on comissao_liberacoes for select to authenticated
  using ((select app.eh_direcao()));
