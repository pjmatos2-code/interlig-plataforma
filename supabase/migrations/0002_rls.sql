-- =====================================================================
-- Migração 0002: RLS — matriz de perfis do PRD seção 2
-- Autorização por LINHA, no banco. O frontend só esconde o que a RLS já nega.
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- Funções de contexto (SECURITY DEFINER: leem `usuarios` sem cair na
-- própria política e sem recursão infinita)
-- ---------------------------------------------------------------------
create or replace function app.perfil() returns perfil_usuario
language sql stable security definer set search_path = public, pg_temp as $$
  select u.perfil from usuarios u where u.id = auth.uid() and u.ativo
$$;

create or replace function app.pop_atual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.pop_id from usuarios u where u.id = auth.uid() and u.ativo
$$;

create or replace function app.vendedor_atual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.vendedor_id from usuarios u where u.id = auth.uid() and u.ativo
$$;

create or replace function app.eh_gestor() returns boolean
language sql stable as $$ select app.perfil() = 'gestor' $$;

create or replace function app.eh_supervisor() returns boolean
language sql stable as $$ select app.perfil() = 'supervisor' $$;

create or replace function app.eh_vendedora() returns boolean
language sql stable as $$ select app.perfil() = 'vendedora' $$;

/* Escopo de linha: gestor vê tudo; supervisor vê a sua POP; vendedora vê o
   que é dela. Usada por contratos, tickets, metas e comissões. */
create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid) returns boolean
language sql stable as $$
  select case app.perfil()
    when 'gestor'     then true
    when 'supervisor' then p_pop_id = app.pop_atual()
    when 'vendedora'  then p_vendedor_id = app.vendedor_atual()
    else false
  end
$$;

grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------------
-- Ativação da RLS em todas as tabelas
-- ---------------------------------------------------------------------
alter table usuarios              enable row level security;
alter table pops                  enable row level security;
alter table vendedores            enable row level security;
alter table planos                enable row level security;
alter table origem_map            enable row level security;
alter table calendario            enable row level security;
alter table bairros_geo           enable row level security;
alter table clientes              enable row level security;
alter table contratos             enable row level security;
alter table titulos               enable row level security;
alter table metas                 enable row level security;
alter table regras_comissao       enable row level security;
alter table comissoes_fechadas    enable row level security;
alter table sync_runs             enable row level security;
alter table motivos_nao_conversao enable row level security;
alter table sz_atendentes_map     enable row level security;
alter table tickets               enable row level security;
alter table ticket_eventos        enable row level security;

-- ---------------------------------------------------------------------
-- usuarios — gestor administra; cada um lê a própria linha
-- ---------------------------------------------------------------------
create policy usuarios_sel_proprio on usuarios for select to authenticated
  using (id = auth.uid());
create policy usuarios_sel_gestor on usuarios for select to authenticated
  using (app.eh_gestor());
create policy usuarios_sel_supervisor on usuarios for select to authenticated
  using (app.eh_supervisor() and pop_id = app.pop_atual());
create policy usuarios_adm_gestor on usuarios for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- ---------------------------------------------------------------------
-- Cadastros de leitura geral (nomes, não valores) — escrita só do gestor
-- ---------------------------------------------------------------------
create policy pops_sel on pops for select to authenticated using (true);
create policy pops_adm on pops for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- vendedores: leitura geral porque o ranking mostra POSIÇÕES e nomes às
-- vendedoras (PRD 2) — nenhum valor financeiro mora nesta tabela.
create policy vendedores_sel on vendedores for select to authenticated using (true);
create policy vendedores_adm on vendedores for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy planos_sel on planos for select to authenticated using (true);
create policy planos_adm on planos for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy origem_map_sel on origem_map for select to authenticated using (true);
create policy origem_map_adm on origem_map for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy calendario_sel on calendario for select to authenticated using (true);
create policy calendario_adm on calendario for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy bairros_geo_sel on bairros_geo for select to authenticated using (true);
create policy bairros_geo_adm on bairros_geo for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy motivos_sel on motivos_nao_conversao for select to authenticated using (true);
create policy motivos_adm on motivos_nao_conversao for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy sz_map_sel on sz_atendentes_map for select to authenticated
  using (app.eh_gestor() or app.eh_supervisor());
create policy sz_map_adm on sz_atendentes_map for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- Selo "atualizado há X min" aparece em todas as telas → leitura geral.
create policy sync_runs_sel on sync_runs for select to authenticated using (true);
-- Escrita só pelo worker (service_role, que ignora RLS).

-- ---------------------------------------------------------------------
-- contratos — coração da matriz da seção 2
-- ---------------------------------------------------------------------
create policy contratos_sel on contratos for select to authenticated
  using (app.no_escopo(pop_id, vendedor_id));
-- Escrita: apenas o worker de sync (service_role). O SGP é a fonte da verdade.

-- clientes: visíveis quando existe contrato no escopo do usuário
create policy clientes_sel on clientes for select to authenticated
  using (
    app.eh_gestor()
    or exists (
      select 1 from contratos c
      where c.cliente_id = clientes.id and app.no_escopo(c.pop_id, c.vendedor_id)
    )
  );

-- titulos: financeiro. Gestor vê tudo; supervisor vê os da POP dele porque
-- precisa da inadimplência por safra (PRD 2 e 5.11). Vendedora não vê.
create policy titulos_sel on titulos for select to authenticated
  using (
    app.eh_gestor()
    or (
      app.eh_supervisor()
      and exists (
        select 1 from contratos c
        where c.id = titulos.contrato_id and c.pop_id = app.pop_atual()
      )
    )
  );

-- ---------------------------------------------------------------------
-- metas / comissão
-- ---------------------------------------------------------------------
create policy metas_sel on metas for select to authenticated
  using (
    app.eh_gestor()
    or (escopo = 'global')
    or (escopo = 'pop' and referencia_id = app.pop_atual())
    or (escopo = 'vendedora' and (
          referencia_id = app.vendedor_atual()
          or (app.eh_supervisor() and exists (
                select 1 from vendedores v
                where v.id = metas.referencia_id and v.pop_id = app.pop_atual()))
       ))
  );
create policy metas_adm on metas for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- Regra de comissão é leitura geral: alimenta o simulador da própria vendedora.
create policy regras_sel on regras_comissao for select to authenticated using (true);
create policy regras_adm on regras_comissao for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

create policy comissoes_sel on comissoes_fechadas for select to authenticated
  using (
    app.eh_gestor()
    or comissoes_fechadas.vendedor_id = app.vendedor_atual()
    or (app.eh_supervisor() and exists (
          select 1 from vendedores v
          where v.id = comissoes_fechadas.vendedor_id and v.pop_id = app.pop_atual()))
  );
create policy comissoes_adm on comissoes_fechadas for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- ---------------------------------------------------------------------
-- CRM — tickets
-- Gestor: qualquer um. Supervisor: os do time (pode reatribuir).
-- Vendedora: só os próprios. Sem política de DELETE em nenhum perfil
-- (PRD 3.9: ticket não pode ser excluído) — reforçado por trigger em 0003.
-- ---------------------------------------------------------------------
create policy tickets_sel on tickets for select to authenticated
  using (
    app.no_escopo(pop_id, vendedor_id)
    -- "não atribuídos" ficam visíveis ao supervisor da POP e ao gestor
    or (vendedor_id is null and (app.eh_gestor() or app.eh_supervisor()))
  );

create policy tickets_ins on tickets for insert to authenticated
  with check (
    app.eh_gestor()
    or (app.eh_supervisor() and pop_id = app.pop_atual())
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );

create policy tickets_upd on tickets for update to authenticated
  using (
    app.eh_gestor()
    or (app.eh_supervisor()
        and (pop_id = app.pop_atual() or vendedor_id is null))
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  )
  with check (
    app.eh_gestor()
    or app.eh_supervisor()
    -- vendedora não pode empurrar o ticket para fora do próprio nome
    or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
  );

-- ---------------------------------------------------------------------
-- CRM — eventos (trilha de auditoria: só nasce, nunca muda nem some)
-- ---------------------------------------------------------------------
create policy eventos_sel on ticket_eventos for select to authenticated
  using (exists (select 1 from tickets t where t.id = ticket_eventos.ticket_id));

create policy eventos_ins on ticket_eventos for insert to authenticated
  with check (
    usuario_id is not distinct from auth.uid()
    and exists (select 1 from tickets t where t.id = ticket_eventos.ticket_id)
  );
