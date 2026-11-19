-- GRR, Etapa 2 (18/11/2026): metas e faixas por indicador e fotos congeladas dos resultados.
--
-- O GRR pode virar plataforma independente, usada por outras unidades de
-- negócio, cada uma com o seu SGP (decisão do Paulo, 18/11/2026). Por isso:
--  - as tabelas ficam num esquema próprio, `grr`, fora do `public`;
--  - toda tabela carrega a chave da empresa, mesmo havendo uma só hoje;
--  - os recortes (unidade, equipe, agente) são guardados como referência
--    solta (tipo + id), sem chave estrangeira para as tabelas da plataforma.
-- A aplicação lê e grava por visões finas no `public` (`grr_*`), com
-- security_invoker: a permissão por linha das tabelas do `grr` continua valendo
-- e nenhuma configuração da API do Supabase precisa mudar.
--
-- Só acrescenta: não altera nenhuma tabela, função ou policy existente.

create schema if not exists grr;

-- ---------------------------------------------------------------------
-- empresas (unidades de negócio)
-- ---------------------------------------------------------------------
create table if not exists grr.empresas (
  chave text primary key,
  nome text not null,
  criado_em timestamptz not null default now()
);
insert into grr.empresas (chave, nome) values ('interlig', 'Interlig') on conflict (chave) do nothing;

-- ---------------------------------------------------------------------
-- indicadores: o que a administração configura em cada indicador do
-- catálogo. A definição e a conta de cada chave ficam no código
-- (lib/grr/catalogo.ts e lib/indicadores).
-- ---------------------------------------------------------------------
create table if not exists grr.indicadores (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  chave text not null,
  ativo boolean not null default true,
  dono text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  constraint grr_indicadores_chave_uq unique (empresa, setor, chave)
);

-- ---------------------------------------------------------------------
-- metas e faixas, com vigência. Só inclusão: mudar a meta é incluir outra
-- linha com a data de início; vale a mais recente que já começou. Linha
-- com meta nula encerra a meta a partir daquela data. O histórico fica.
--   maior é melhor: valor >= meta → ok; >= limite_atencao → atenção
--   menor é melhor: valor <= meta → ok; <= limite_atencao → atenção
-- ---------------------------------------------------------------------
create table if not exists grr.metas (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  indicador text not null,
  escopo_tipo text not null default 'empresa' check (escopo_tipo in ('empresa', 'unidade', 'equipe', 'agente')),
  escopo_ref uuid,
  vigente_desde date not null,
  meta numeric,
  limite_atencao numeric,
  observacao text,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios (id) on delete set null,
  constraint grr_metas_indicador_fk foreign key (empresa, setor, indicador) references grr.indicadores (empresa, setor, chave),
  constraint grr_metas_escopo_ck check ((escopo_tipo = 'empresa') = (escopo_ref is null)),
  constraint grr_metas_faixa_ck check ((meta is null) = (limite_atencao is null))
);
create index if not exists grr_metas_busca_idx on grr.metas (empresa, setor, indicador, vigente_desde desc, criado_em desc);

-- ---------------------------------------------------------------------
-- fotos: os resultados congelados de um período, por recorte. Nunca mudam:
-- corrigir é congelar de novo, numa versão seguinte, com o motivo.
-- `dados` guarda o que o painel mostrou (cartões, números e quebras), sem
-- a lista de tickets (nomes de clientes não entram na foto).
-- ---------------------------------------------------------------------
create table if not exists grr.fotos (
  id uuid primary key default gen_random_uuid(),
  empresa text not null default 'interlig' references grr.empresas (chave),
  setor text not null default 'comercial',
  periodo_tipo text not null default 'semana' check (periodo_tipo in ('semana', 'mes')),
  periodo_inicio date not null,
  periodo_fim date not null,
  escopo_tipo text not null check (escopo_tipo in ('empresa', 'unidade', 'equipe', 'agente')),
  escopo_ref uuid,
  escopo_rotulo text not null,
  versao integer not null default 1 check (versao >= 1),
  dados jsonb not null,
  motivo text,
  origem text not null default 'manual' check (origem in ('manual', 'rotina', 'reuniao')),
  congelado_em timestamptz not null default now(),
  congelado_por uuid references public.usuarios (id) on delete set null,
  constraint grr_fotos_escopo_ck check ((escopo_tipo = 'empresa') = (escopo_ref is null)),
  constraint grr_fotos_periodo_ck check (periodo_fim >= periodo_inicio),
  constraint grr_fotos_motivo_ck check (versao = 1 or coalesce(btrim(motivo), '') <> '')
);
create unique index if not exists grr_fotos_versao_uq
  on grr.fotos (empresa, setor, periodo_tipo, periodo_inicio, escopo_tipo, coalesce(escopo_ref, '00000000-0000-0000-0000-000000000000'::uuid), versao);
create index if not exists grr_fotos_periodo_idx on grr.fotos (empresa, setor, periodo_tipo, periodo_inicio desc, versao desc);

-- ---------------------------------------------------------------------
-- só inclusão: meta e foto não se alteram nem se apagam
-- ---------------------------------------------------------------------
create or replace function grr.somente_inclusao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registro de grr.% não pode ser alterado nem excluído: inclua uma linha nova.', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists metas_somente_inclusao on grr.metas;
create trigger metas_somente_inclusao before update or delete on grr.metas
  for each row execute function grr.somente_inclusao();
drop trigger if exists fotos_somente_inclusao on grr.fotos;
create trigger fotos_somente_inclusao before update or delete on grr.fotos
  for each row execute function grr.somente_inclusao();

-- ---------------------------------------------------------------------
-- permissão por linha
--   leitura: administração, direção e coordenação (quem abre o GRR);
--   configuração (indicadores e metas): só a administração;
--   congelar: administração e direção;
--   foto: a coordenação lê só o próprio recorte.
-- ---------------------------------------------------------------------
alter table grr.empresas enable row level security;
alter table grr.indicadores enable row level security;
alter table grr.metas enable row level security;
alter table grr.fotos enable row level security;

drop policy if exists empresas_sel on grr.empresas;
create policy empresas_sel on grr.empresas for select to authenticated
  using ((select app.perfil()) in ('gestor', 'direcao', 'supervisor'));

drop policy if exists indicadores_sel on grr.indicadores;
create policy indicadores_sel on grr.indicadores for select to authenticated
  using ((select app.perfil()) in ('gestor', 'direcao', 'supervisor'));
drop policy if exists indicadores_ins on grr.indicadores;
create policy indicadores_ins on grr.indicadores for insert to authenticated
  with check ((select app.eh_gestor()));
drop policy if exists indicadores_upd on grr.indicadores;
create policy indicadores_upd on grr.indicadores for update to authenticated
  using ((select app.eh_gestor())) with check ((select app.eh_gestor()));

drop policy if exists metas_sel on grr.metas;
create policy metas_sel on grr.metas for select to authenticated
  using ((select app.perfil()) in ('gestor', 'direcao', 'supervisor'));
drop policy if exists metas_ins on grr.metas;
create policy metas_ins on grr.metas for insert to authenticated
  with check ((select app.eh_gestor()));

drop policy if exists fotos_sel on grr.fotos;
create policy fotos_sel on grr.fotos for select to authenticated
  using (
    (select app.perfil()) in ('gestor', 'direcao')
    or (
      (select app.perfil()) = 'supervisor'
      and (
        -- quem coordena agentes: a foto da própria equipe e as dos agentes dela
        (escopo_tipo = 'equipe' and escopo_ref = (select auth.uid()))
        or (escopo_tipo = 'agente' and escopo_ref in (select app.vendedores_coordenados()))
        -- quem não coordena agentes: a foto da própria unidade e as dos agentes da unidade
        or (
          not (select app.coordena_time())
          and (
            (escopo_tipo = 'unidade' and escopo_ref = (select app.pop_atual()))
            or (escopo_tipo = 'agente' and escopo_ref in (select v.id from public.vendedores v where v.pop_id = (select app.pop_atual())))
          )
        )
      )
    )
  );
drop policy if exists fotos_ins on grr.fotos;
create policy fotos_ins on grr.fotos for insert to authenticated
  with check ((select app.perfil()) in ('gestor', 'direcao'));

-- ---------------------------------------------------------------------
-- acesso: o esquema não é exposto pela API; a aplicação usa as visões
-- ---------------------------------------------------------------------
grant usage on schema grr to authenticated, service_role;
grant select on grr.empresas to authenticated;
grant select, insert, update on grr.indicadores to authenticated;
grant select, insert on grr.metas to authenticated;
grant select, insert on grr.fotos to authenticated;
grant all on all tables in schema grr to service_role;

create or replace view public.grr_indicadores with (security_invoker = true) as select * from grr.indicadores;
create or replace view public.grr_metas with (security_invoker = true) as select * from grr.metas;
create or replace view public.grr_fotos with (security_invoker = true) as select * from grr.fotos;

revoke all on public.grr_indicadores, public.grr_metas, public.grr_fotos from anon, authenticated;
grant select, insert, update on public.grr_indicadores to authenticated;
grant select, insert on public.grr_metas to authenticated;
grant select, insert on public.grr_fotos to authenticated;
grant all on public.grr_indicadores, public.grr_metas, public.grr_fotos to service_role;

comment on schema grr is 'GRR, Gestão da Rotina de Resultados: tabelas próprias do módulo, isoladas da plataforma.';
comment on view public.grr_indicadores is 'Visão fina sobre grr.indicadores (security_invoker): a permissão por linha da tabela continua valendo.';
comment on view public.grr_metas is 'Visão fina sobre grr.metas (security_invoker).';
comment on view public.grr_fotos is 'Visão fina sobre grr.fotos (security_invoker).';

-- ---------------------------------------------------------------------
-- indicadores do GRR Comercial (Etapa 1 + conversão por safra)
-- ---------------------------------------------------------------------
insert into grr.indicadores (chave) values
  ('vendas_semana'), ('vendas_mes'), ('ativacoes_semana'), ('instalacoes_paradas'), ('assinatura_48h'),
  ('conversao'), ('conversao_safra'), ('leads'), ('receita'), ('ticket'), ('agentes_com_venda'), ('perdidos'), ('retornos')
on conflict on constraint grr_indicadores_chave_uq do nothing;

notify pgrst, 'reload schema';
