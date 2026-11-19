-- GRR (19/11/2026): reuniões do GRR e compromissos.
--
-- Uma estrutura só para as modalidades de reunião (decisão: não duplicar o
-- banco). Começa pela Reunião Semanal da Equipe Comercial (coordenador com os
-- agentes, normalmente aos sábados). A reunião de resultados da diretoria
-- continua no Relatório da diretoria e não muda; a modalidade 'diretoria' já
-- fica prevista aqui para quando for trazida.
--
-- Como na 0134: esquema `grr`, chave de empresa em toda tabela, recortes como
-- referência solta (tipo + id) e acesso por visões finas no `public`.
--
-- Integridade:
--  - reunião encerrada não se altera nem se apaga (gatilho);
--  - no encerramento a reunião guarda a foto dos indicadores, das metas e dos
--    comparativos (`dados`), os participantes e os compromissos daquele momento;
--  - correções depois do encerramento entram em grr.reuniao_registros, que só
--    aceita inclusão;
--  - compromisso não se apaga: muda de situação (e cada mudança fica registrada).
--
-- Só acrescenta: não altera nenhuma tabela, função ou policy existente.

-- ---------------------------------------------------------------------
-- reuniões
-- ---------------------------------------------------------------------
create table if not exists grr.reunioes (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  modalidade text not null check (modalidade in ('equipe', 'diretoria')),
  escopo_tipo text not null check (escopo_tipo in ('empresa', 'unidade', 'equipe')),
  escopo_ref uuid,
  escopo_rotulo text not null,
  -- quem conduz (usuário da plataforma)
  responsavel_id uuid references public.usuarios (id) on delete set null,
  responsavel_nome text,
  data_reuniao date not null,
  periodo_inicio date not null,
  periodo_fim date not null,
  -- [{ "id": <vendedor ou usuário>, "nome": "...", "papel": "agente" | "coordenacao" | "convidado" }]
  participantes jsonb not null default '[]'::jsonb,
  observacoes text,
  boas_praticas text,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'encerrada')),
  -- foto no encerramento: indicadores, metas, comparativos e compromissos
  dados jsonb,
  corte_em timestamptz,
  encerrada_em timestamptz,
  encerrada_por uuid references public.usuarios (id) on delete set null,
  criada_em timestamptz not null default now(),
  criada_por uuid references public.usuarios (id) on delete set null,
  atualizada_em timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio),
  check ((escopo_tipo = 'empresa') = (escopo_ref is null)),
  check ((situacao = 'encerrada') = (encerrada_em is not null and dados is not null))
);
create index if not exists grr_reunioes_escopo_idx on grr.reunioes (empresa, setor, modalidade, escopo_tipo, escopo_ref, data_reuniao desc);

-- ---------------------------------------------------------------------
-- compromissos: operacionais (autonomia da coordenação, sem aprovação) e
-- gerenciais (investimento, política ou fora da autonomia: a diretoria aprova)
-- ---------------------------------------------------------------------
create table if not exists grr.compromissos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  reuniao_id uuid not null references grr.reunioes (id),
  tipo text not null default 'operacional' check (tipo in ('operacional', 'gerencial')),
  -- quem assume: um agente (referência solta ao cadastro de vendedores) ou a equipe
  agente_id uuid,
  responsavel_nome text,
  descricao text not null check (length(trim(descricao)) > 0),
  prazo date,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'em_andamento', 'concluido', 'nao_feito', 'cancelado')),
  aprovacao text not null default 'nao_se_aplica' check (aprovacao in ('nao_se_aplica', 'aguardando', 'aprovado', 'ajuste', 'rejeitado')),
  -- reunião em que a situação foi conferida pela última vez
  conferido_em uuid references grr.reunioes (id),
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  check ((tipo = 'gerencial') = (aprovacao <> 'nao_se_aplica'))
);
create index if not exists grr_compromissos_reuniao_idx on grr.compromissos (reuniao_id);

-- ---------------------------------------------------------------------
-- registros: correções depois do encerramento e o histórico de cada
-- mudança de compromisso. Só inclusão.
-- ---------------------------------------------------------------------
create table if not exists grr.reuniao_registros (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  reuniao_id uuid not null references grr.reunioes (id),
  compromisso_id uuid references grr.compromissos (id),
  tipo text not null check (tipo in ('correcao', 'compromisso')),
  texto text,
  dados jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null
);
create index if not exists grr_reuniao_registros_idx on grr.reuniao_registros (reuniao_id, criado_em);

drop trigger if exists reuniao_registros_somente_inclusao on grr.reuniao_registros;
create trigger reuniao_registros_somente_inclusao before update or delete on grr.reuniao_registros
  for each row execute function grr.somente_inclusao();

-- reunião encerrada fica como está; aberta pode ser editada, nunca apagada
create or replace function grr.reuniao_antes_de_gravar() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reunião do GRR não pode ser excluída.' using errcode = 'restrict_violation';
  end if;
  if old.situacao = 'encerrada' then
    raise exception 'Reunião encerrada não pode ser alterada: registre uma correção.' using errcode = 'restrict_violation';
  end if;
  if new.modalidade <> old.modalidade or new.escopo_tipo <> old.escopo_tipo or new.escopo_ref is distinct from old.escopo_ref or new.empresa <> old.empresa then
    raise exception 'A modalidade e o recorte da reunião não mudam depois de criada.' using errcode = 'restrict_violation';
  end if;
  new.atualizada_em := now();
  return new;
end;
$$;
drop trigger if exists reunioes_antes_de_gravar on grr.reunioes;
create trigger reunioes_antes_de_gravar before update or delete on grr.reunioes
  for each row execute function grr.reuniao_antes_de_gravar();

-- compromisso: não se apaga; a descrição não muda depois que a reunião de origem foi encerrada;
-- cada mudança de situação ou aprovação vira um registro
create or replace function grr.compromisso_antes_de_gravar() returns trigger
language plpgsql as $$
declare
  encerrada boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Compromisso do GRR não pode ser excluído: marque como cancelado.' using errcode = 'restrict_violation';
  end if;
  select r.situacao = 'encerrada' into encerrada from grr.reunioes r where r.id = old.reuniao_id;
  if encerrada and (new.descricao <> old.descricao or new.tipo <> old.tipo or new.agente_id is distinct from old.agente_id or new.prazo is distinct from old.prazo or new.reuniao_id <> old.reuniao_id) then
    raise exception 'Compromisso de reunião encerrada: só a situação e a aprovação mudam.' using errcode = 'restrict_violation';
  end if;
  new.atualizado_em := now();
  if new.situacao is distinct from old.situacao or new.aprovacao is distinct from old.aprovacao then
    insert into grr.reuniao_registros (empresa, reuniao_id, compromisso_id, tipo, dados, criado_por)
    values (new.empresa, coalesce(new.conferido_em, new.reuniao_id), new.id, 'compromisso',
      jsonb_build_object('situacao_antes', old.situacao, 'situacao', new.situacao, 'aprovacao_antes', old.aprovacao, 'aprovacao', new.aprovacao),
      (select auth.uid()));
  end if;
  return new;
end;
$$;
drop trigger if exists compromissos_antes_de_gravar on grr.compromissos;
create trigger compromissos_antes_de_gravar before update or delete on grr.compromissos
  for each row execute function grr.compromisso_antes_de_gravar();

-- ---------------------------------------------------------------------
-- permissão por linha
--   direção e administração: todas as reuniões;
--   coordenação: só as do próprio recorte (a equipe que coordena ou, sem
--   equipe, a própria unidade), e só ela conduz e encerra as da equipe;
--   agentes: sem acesso por enquanto (decisão pendente).
-- ---------------------------------------------------------------------
create or replace function grr.reuniao_no_escopo(p_escopo_tipo text, p_escopo_ref uuid) returns boolean
language sql stable security definer set search_path = public, app, grr as $$
  select case
    when app.perfil() in ('gestor', 'direcao') then true
    when app.perfil() = 'supervisor' then
      (p_escopo_tipo = 'equipe' and p_escopo_ref = auth.uid())
      or (not app.coordena_time() and p_escopo_tipo = 'unidade' and p_escopo_ref = app.pop_atual())
    else false
  end
$$;
revoke all on function grr.reuniao_no_escopo(text, uuid) from public, anon;
grant execute on function grr.reuniao_no_escopo(text, uuid) to authenticated, service_role;

alter table grr.reunioes enable row level security;
alter table grr.compromissos enable row level security;
alter table grr.reuniao_registros enable row level security;

drop policy if exists reunioes_sel on grr.reunioes;
create policy reunioes_sel on grr.reunioes for select to authenticated
  using (grr.reuniao_no_escopo(escopo_tipo, escopo_ref));
drop policy if exists reunioes_ins on grr.reunioes;
create policy reunioes_ins on grr.reunioes for insert to authenticated
  with check (grr.reuniao_no_escopo(escopo_tipo, escopo_ref) and criada_por = (select auth.uid()));
drop policy if exists reunioes_upd on grr.reunioes;
create policy reunioes_upd on grr.reunioes for update to authenticated
  using (grr.reuniao_no_escopo(escopo_tipo, escopo_ref))
  with check (grr.reuniao_no_escopo(escopo_tipo, escopo_ref));

drop policy if exists compromissos_sel on grr.compromissos;
create policy compromissos_sel on grr.compromissos for select to authenticated
  using (exists (select 1 from grr.reunioes r where r.id = reuniao_id and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref)));
drop policy if exists compromissos_ins on grr.compromissos;
create policy compromissos_ins on grr.compromissos for insert to authenticated
  with check (
    exists (select 1 from grr.reunioes r where r.id = reuniao_id and r.situacao = 'aberta' and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref))
    -- gerencial nasce aguardando a diretoria
    and (tipo = 'operacional' or aprovacao = 'aguardando')
  );
drop policy if exists compromissos_upd on grr.compromissos;
create policy compromissos_upd on grr.compromissos for update to authenticated
  using (exists (select 1 from grr.reunioes r where r.id = reuniao_id and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref)))
  with check (
    exists (select 1 from grr.reunioes r where r.id = reuniao_id and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref))
  );

drop policy if exists reuniao_registros_sel on grr.reuniao_registros;
create policy reuniao_registros_sel on grr.reuniao_registros for select to authenticated
  using (exists (select 1 from grr.reunioes r where r.id = reuniao_id and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref)));
drop policy if exists reuniao_registros_ins on grr.reuniao_registros;
create policy reuniao_registros_ins on grr.reuniao_registros for insert to authenticated
  with check (exists (select 1 from grr.reunioes r where r.id = reuniao_id and grr.reuniao_no_escopo(r.escopo_tipo, r.escopo_ref)));

-- só a diretoria decide a aprovação de compromisso gerencial
create or replace function grr.aprovacao_so_diretoria() returns trigger
language plpgsql as $$
begin
  if new.aprovacao is distinct from old.aprovacao and coalesce((select app.perfil()::text), '') not in ('gestor', 'direcao') and current_user = 'authenticated' then
    raise exception 'Só a diretoria aprova, pede ajuste ou rejeita compromisso gerencial.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
drop trigger if exists compromissos_aprovacao on grr.compromissos;
create trigger compromissos_aprovacao before update on grr.compromissos
  for each row execute function grr.aprovacao_so_diretoria();

-- ---------------------------------------------------------------------
-- acesso pela API: visões finas no public, como na 0134
-- ---------------------------------------------------------------------
grant select, insert, update on grr.reunioes to authenticated;
grant select, insert, update on grr.compromissos to authenticated;
grant select, insert on grr.reuniao_registros to authenticated;
grant all on grr.reunioes, grr.compromissos, grr.reuniao_registros to service_role;

create or replace view public.grr_reunioes with (security_invoker = true) as select * from grr.reunioes;
create or replace view public.grr_compromissos with (security_invoker = true) as select * from grr.compromissos;
create or replace view public.grr_reuniao_registros with (security_invoker = true) as select * from grr.reuniao_registros;
revoke all on public.grr_reunioes, public.grr_compromissos, public.grr_reuniao_registros from anon, authenticated;
grant select, insert, update on public.grr_reunioes to authenticated;
grant select, insert, update on public.grr_compromissos to authenticated;
grant select, insert on public.grr_reuniao_registros to authenticated;
grant all on public.grr_reunioes, public.grr_compromissos, public.grr_reuniao_registros to service_role;

notify pgrst, 'reload schema';
