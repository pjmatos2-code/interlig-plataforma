-- GRR, Etapa 3 (19/11/2026): diagnósticos dos desvios e planos de ação.
--
-- Diagnóstico: o que a coordenação registra sobre um indicador em atenção ou
-- crítico (causa, evidências, providências já tomadas, solução proposta),
-- ligado ao indicador, à semana e ao recorte. Cada salvamento é uma versão
-- nova: autor, data e histórico ficam guardados.
--
-- Plano de ação: uma ou mais ações por indicador ou problema, com resultado
-- esperado, responsável, prazo, evidências e histórico. A aprovação da
-- diretoria (aguardando, aprovado, ajuste, rejeitado; ajuste e rejeição com
-- justificativa) fica separada da situação operacional (pendente, em
-- andamento, aguardando validação, concluída, cancelada). "Atrasada" é
-- calculada: prazo vencido sem conclusão.
--
-- Mesmo padrão da 0134 e da 0135: esquema `grr`, chave de empresa, recorte
-- solto (tipo + id), visões finas no `public`. Só acrescenta.

-- ---------------------------------------------------------------------
-- recorte de quem abre (inclui agente): direção e administração tudo;
-- coordenação com equipe → a equipe e os agentes dela; sem equipe → a
-- unidade e os agentes da unidade
-- ---------------------------------------------------------------------
create or replace function grr.no_escopo(p_tipo text, p_ref uuid) returns boolean
language sql stable security definer set search_path = public, app, grr as $$
  select case
    when app.perfil() in ('gestor', 'direcao') then true
    when app.perfil() = 'supervisor' then
      case when app.coordena_time() then
        (p_tipo = 'equipe' and p_ref = auth.uid())
        or (p_tipo = 'agente' and p_ref in (select app.vendedores_coordenados()))
      else
        (p_tipo = 'unidade' and p_ref = app.pop_atual())
        or (p_tipo = 'agente' and p_ref in (select v.id from public.vendedores v where v.pop_id = app.pop_atual()))
      end
    else false
  end
$$;
revoke all on function grr.no_escopo(text, uuid) from public, anon;
grant execute on function grr.no_escopo(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- diagnósticos (só inclusão; a versão mais recente vale)
-- ---------------------------------------------------------------------
create table if not exists grr.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  periodo_inicio date not null,
  periodo_fim date not null,
  indicador text not null,
  escopo_tipo text not null check (escopo_tipo in ('empresa', 'unidade', 'equipe', 'agente')),
  escopo_ref uuid,
  escopo_rotulo text not null,
  versao integer not null default 1 check (versao >= 1),
  causa text not null check (length(trim(causa)) > 0),
  evidencias text,
  providencias text,
  solucao text,
  -- como o indicador estava quando o diagnóstico foi escrito
  situacao_indicador text check (situacao_indicador in ('ok', 'atencao', 'critico', 'sem_meta')),
  valor text,
  meta text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null,
  check ((escopo_tipo = 'empresa') = (escopo_ref is null))
);
create unique index if not exists grr_diagnosticos_versao_uq
  on grr.diagnosticos (empresa, setor, periodo_inicio, indicador, escopo_tipo, coalesce(escopo_ref, '00000000-0000-0000-0000-000000000000'::uuid), versao);
create index if not exists grr_diagnosticos_periodo_idx on grr.diagnosticos (empresa, setor, periodo_inicio desc, indicador);

drop trigger if exists diagnosticos_somente_inclusao on grr.diagnosticos;
create trigger diagnosticos_somente_inclusao before update or delete on grr.diagnosticos
  for each row execute function grr.somente_inclusao();

-- ---------------------------------------------------------------------
-- planos de ação
-- ---------------------------------------------------------------------
create table if not exists grr.acoes (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  indicador text,
  problema text,
  periodo_inicio date not null,
  escopo_tipo text not null check (escopo_tipo in ('empresa', 'unidade', 'equipe', 'agente')),
  escopo_ref uuid,
  escopo_rotulo text not null,
  diagnostico_id uuid references grr.diagnosticos (id),
  reuniao_id uuid references grr.reunioes (id),
  descricao text not null check (length(trim(descricao)) > 0),
  resultado_esperado text,
  responsavel_id uuid references public.usuarios (id) on delete set null,
  responsavel_nome text not null,
  prazo date,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'em_andamento', 'aguardando_validacao', 'concluida', 'cancelada')),
  aprovacao text not null default 'aguardando' check (aprovacao in ('aguardando', 'aprovado', 'ajuste', 'rejeitado')),
  aprovacao_justificativa text,
  aprovacao_por uuid references public.usuarios (id) on delete set null,
  aprovacao_em timestamptz,
  -- avisos de prazo já enviados (o sistema marca; não entra no histórico)
  aviso_prazo_em date,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  check (indicador is not null or problema is not null),
  check ((escopo_tipo = 'empresa') = (escopo_ref is null)),
  check (aprovacao not in ('ajuste', 'rejeitado') or length(trim(coalesce(aprovacao_justificativa, ''))) > 0)
);
create index if not exists grr_acoes_escopo_idx on grr.acoes (empresa, setor, escopo_tipo, escopo_ref, situacao);
create index if not exists grr_acoes_prazo_idx on grr.acoes (prazo) where situacao in ('pendente', 'em_andamento');

-- histórico de cada plano (só inclusão): criação, mudanças, evidências e comentários
create table if not exists grr.acao_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  acao_id uuid not null references grr.acoes (id),
  tipo text not null check (tipo in ('criada', 'situacao', 'aprovacao', 'edicao', 'evidencia', 'comentario')),
  texto text,
  dados jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null
);
create index if not exists grr_acao_eventos_idx on grr.acao_eventos (acao_id, criado_em);
drop trigger if exists acao_eventos_somente_inclusao on grr.acao_eventos;
create trigger acao_eventos_somente_inclusao before update or delete on grr.acao_eventos
  for each row execute function grr.somente_inclusao();

-- plano não se apaga; aprovação só pela diretoria (o recorte pode reenviar
-- depois de um pedido de ajuste); cada mudança vira evento
create or replace function grr.acao_antes_de_gravar() returns trigger
language plpgsql as $$
declare
  diretoria boolean := coalesce((select app.perfil()::text), '') in ('gestor', 'direcao') or current_user <> 'authenticated';
  mudou jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    raise exception 'Plano de ação do GRR não pode ser excluído: marque como cancelado.' using errcode = 'restrict_violation';
  end if;
  if new.aprovacao is distinct from old.aprovacao then
    if not diretoria and not (old.aprovacao = 'ajuste' and new.aprovacao = 'aguardando') then
      raise exception 'Só a diretoria aprova, pede ajuste ou rejeita plano de ação.' using errcode = 'insufficient_privilege';
    end if;
    if new.aprovacao in ('aprovado', 'ajuste', 'rejeitado') then
      new.aprovacao_por := (select auth.uid());
      new.aprovacao_em := now();
    end if;
    insert into grr.acao_eventos (empresa, acao_id, tipo, texto, dados, criado_por)
    values (new.empresa, new.id, 'aprovacao', new.aprovacao_justificativa, jsonb_build_object('antes', old.aprovacao, 'depois', new.aprovacao), (select auth.uid()));
  end if;
  if new.situacao is distinct from old.situacao then
    insert into grr.acao_eventos (empresa, acao_id, tipo, dados, criado_por)
    values (new.empresa, new.id, 'situacao', jsonb_build_object('antes', old.situacao, 'depois', new.situacao), (select auth.uid()));
  end if;
  if new.descricao is distinct from old.descricao then mudou := mudou || jsonb_build_object('descricao', jsonb_build_array(old.descricao, new.descricao)); end if;
  if new.resultado_esperado is distinct from old.resultado_esperado then mudou := mudou || jsonb_build_object('resultado_esperado', jsonb_build_array(old.resultado_esperado, new.resultado_esperado)); end if;
  if new.responsavel_nome is distinct from old.responsavel_nome then mudou := mudou || jsonb_build_object('responsavel', jsonb_build_array(old.responsavel_nome, new.responsavel_nome)); end if;
  if new.prazo is distinct from old.prazo then mudou := mudou || jsonb_build_object('prazo', jsonb_build_array(old.prazo, new.prazo)); end if;
  if mudou <> '{}'::jsonb then
    insert into grr.acao_eventos (empresa, acao_id, tipo, dados, criado_por) values (new.empresa, new.id, 'edicao', mudou, (select auth.uid()));
  end if;
  if new.empresa <> old.empresa or new.escopo_tipo <> old.escopo_tipo or new.escopo_ref is distinct from old.escopo_ref then
    raise exception 'O recorte do plano de ação não muda depois de criado.' using errcode = 'restrict_violation';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists acoes_antes_de_gravar on grr.acoes;
create trigger acoes_antes_de_gravar before update or delete on grr.acoes
  for each row execute function grr.acao_antes_de_gravar();

-- ---------------------------------------------------------------------
-- permissão por linha
-- ---------------------------------------------------------------------
alter table grr.diagnosticos enable row level security;
alter table grr.acoes enable row level security;
alter table grr.acao_eventos enable row level security;

drop policy if exists diagnosticos_sel on grr.diagnosticos;
create policy diagnosticos_sel on grr.diagnosticos for select to authenticated using (grr.no_escopo(escopo_tipo, escopo_ref));
drop policy if exists diagnosticos_ins on grr.diagnosticos;
create policy diagnosticos_ins on grr.diagnosticos for insert to authenticated
  with check (grr.no_escopo(escopo_tipo, escopo_ref) and criado_por = (select auth.uid()));

drop policy if exists acoes_sel on grr.acoes;
create policy acoes_sel on grr.acoes for select to authenticated using (grr.no_escopo(escopo_tipo, escopo_ref));
drop policy if exists acoes_ins on grr.acoes;
create policy acoes_ins on grr.acoes for insert to authenticated
  with check (grr.no_escopo(escopo_tipo, escopo_ref) and criado_por = (select auth.uid()) and aprovacao = 'aguardando' and situacao = 'pendente');
drop policy if exists acoes_upd on grr.acoes;
create policy acoes_upd on grr.acoes for update to authenticated
  using (grr.no_escopo(escopo_tipo, escopo_ref)) with check (grr.no_escopo(escopo_tipo, escopo_ref));

drop policy if exists acao_eventos_sel on grr.acao_eventos;
create policy acao_eventos_sel on grr.acao_eventos for select to authenticated
  using (exists (select 1 from grr.acoes a where a.id = acao_id and grr.no_escopo(a.escopo_tipo, a.escopo_ref)));
drop policy if exists acao_eventos_ins on grr.acao_eventos;
create policy acao_eventos_ins on grr.acao_eventos for insert to authenticated
  with check (exists (select 1 from grr.acoes a where a.id = acao_id and grr.no_escopo(a.escopo_tipo, a.escopo_ref)));

-- ---------------------------------------------------------------------
-- acesso pela API
-- ---------------------------------------------------------------------
grant select, insert on grr.diagnosticos to authenticated;
grant select, insert, update on grr.acoes to authenticated;
grant select, insert on grr.acao_eventos to authenticated;
grant all on grr.diagnosticos, grr.acoes, grr.acao_eventos to service_role;

create or replace view public.grr_diagnosticos with (security_invoker = true) as select * from grr.diagnosticos;
create or replace view public.grr_acoes with (security_invoker = true) as select * from grr.acoes;
create or replace view public.grr_acao_eventos with (security_invoker = true) as select * from grr.acao_eventos;
revoke all on public.grr_diagnosticos, public.grr_acoes, public.grr_acao_eventos from anon, authenticated;
grant select, insert on public.grr_diagnosticos to authenticated;
grant select, insert, update on public.grr_acoes to authenticated;
grant select, insert on public.grr_acao_eventos to authenticated;
grant all on public.grr_diagnosticos, public.grr_acoes, public.grr_acao_eventos to service_role;

notify pgrst, 'reload schema';
