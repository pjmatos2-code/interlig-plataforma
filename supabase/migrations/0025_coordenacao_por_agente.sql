-- 0025: Coordenador escopado por AGENTES (não mais por POP).
-- O coordenador (perfil supervisor) passa a enxergar apenas as ações das
-- vendedoras atribuídas a ele, em todos os módulos. Isso cobre o caso do PAP,
-- cuja equipe cruza cidades (Altamira + VTX) e não cabe no escopo por POP.

-- 1) vínculo agente -> coordenador
alter table vendedores add column if not exists coordenador_id uuid references usuarios(id);
create index if not exists vendedores_coordenador_idx on vendedores (coordenador_id);

-- 2) helper: a vendedora está sob o coordenador logado?
create or replace function app.agente_sob_coord(p_vendedor_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from vendedores v
    where v.id = p_vendedor_id and v.coordenador_id = auth.uid()
  )
$$;
grant execute on function app.agente_sob_coord(uuid) to authenticated;

-- 3) escopo de linha: supervisor agora é por agente (não por POP)
create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid) returns boolean
language sql stable as $$
  select case
    when app.perfil() = 'gestor'     then true
    when app.perfil() = 'supervisor' then p_vendedor_id is not null and app.agente_sob_coord(p_vendedor_id)
    when app.perfil() in ('vendedora','vendedora_externa') then p_vendedor_id = app.vendedor_atual()
    else false
  end
$$;

-- 4) títulos (financeiro): supervisor vê os contratos das agentes dele
drop policy if exists titulos_sel on titulos;
create policy titulos_sel on titulos for select to authenticated
  using (
    app.eh_gestor()
    or (
      app.eh_supervisor()
      and exists (
        select 1 from contratos c
        where c.id = titulos.contrato_id and app.agente_sob_coord(c.vendedor_id)
      )
    )
  );

-- 5) metas: escopo vendedora do supervisor -> agentes dele
drop policy if exists metas_sel on metas;
create policy metas_sel on metas for select to authenticated
  using (
    app.eh_gestor()
    or (escopo = 'global')
    or (escopo = 'pop' and referencia_id = app.pop_atual())
    or (escopo = 'vendedora' and (
          referencia_id = app.vendedor_atual()
          or (app.eh_supervisor() and app.agente_sob_coord(metas.referencia_id))
       ))
  );

-- 6) comissões fechadas: supervisor vê as das agentes dele
drop policy if exists comissoes_sel on comissoes_fechadas;
create policy comissoes_sel on comissoes_fechadas for select to authenticated
  using (
    app.eh_gestor()
    or comissoes_fechadas.vendedor_id = app.vendedor_atual()
    or (app.eh_supervisor() and app.agente_sob_coord(comissoes_fechadas.vendedor_id))
  );

-- 7) tickets: supervisor vê/edita só os das agentes dele; não vê "não atribuídos"
drop policy if exists tickets_sel on tickets;
create policy tickets_sel on tickets for select to authenticated
  using (
    app.no_escopo(pop_id, vendedor_id)
    -- "não atribuídos" ficam visíveis só ao gestor (decisão 23/08: coordenador
    -- vê estritamente as ações das agentes dele)
    or (vendedor_id is null and app.eh_gestor())
  );

drop policy if exists tickets_ins on tickets;
create policy tickets_ins on tickets for insert to authenticated
  with check (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );

drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated
  using (
    app.eh_gestor()
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  )
  with check (
    app.eh_gestor()
    -- supervisor só pode reatribuir para uma agente dele
    or (app.eh_supervisor() and app.agente_sob_coord(vendedor_id))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );

-- 8) usuários: supervisor vê as contas das agentes dele (antes: por POP)
drop policy if exists usuarios_sel_supervisor on usuarios;
create policy usuarios_sel_supervisor on usuarios for select to authenticated
  using (app.eh_supervisor() and app.agente_sob_coord(usuarios.vendedor_id));
