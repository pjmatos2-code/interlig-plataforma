-- =====================================================================
-- Migração 0003: regras inegociáveis no banco
--   * ticket nunca é excluído e só fecha com desfecho (PRD 3.9)
--   * trilha de auditoria imutável
--   * snapshot de comissão imutável (PRD seção 6)
--   * dias úteis do calendário comercial (base das regras 5.5, 5.6 e 5.13)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dias úteis (convenção da seção 5: seg–sáb menos feriados cadastrados)
-- ---------------------------------------------------------------------
create or replace function app.dias_uteis(p_inicio date, p_fim date) returns integer
language sql stable set search_path = public, pg_temp as $$
  select coalesce(count(*), 0)::int
  from calendario c
  where c.data between p_inicio and p_fim and c.dia_util
$$;

comment on function app.dias_uteis is
  'Dias úteis no intervalo (inclusive). Base do pace (5.5), da projeção (5.6) e do streak (5.13).';

-- ---------------------------------------------------------------------
-- tickets: nunca excluir
-- ---------------------------------------------------------------------
create or replace function app.bloqueia_exclusao() returns trigger
language plpgsql as $$
begin
  raise exception 'Registro de % não pode ser excluído (PRD 3.9).', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create trigger tickets_sem_delete before delete on tickets
  for each row execute function app.bloqueia_exclusao();
create trigger tickets_sem_truncate before truncate on tickets
  for each statement execute function app.bloqueia_exclusao();

create trigger eventos_sem_delete before delete on ticket_eventos
  for each row execute function app.bloqueia_exclusao();
create trigger eventos_sem_update before update on ticket_eventos
  for each row execute function app.bloqueia_exclusao();

-- ---------------------------------------------------------------------
-- tickets: ciclo de vida
-- ---------------------------------------------------------------------
create or replace function app.ticket_antes_de_gravar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.atualizado_em := now();

  -- primeira tratativa = primeira saída de "novo" (regra 5.15)
  if new.etapa <> 'novo' and new.primeira_tratativa_em is null then
    new.primeira_tratativa_em := now();
  end if;

  if tg_op = 'UPDATE' then
    -- Ticket fechado é imutável, exceto reabertura explícita e reconciliação
    -- com o SGP (PRD 3.9).
    if old.etapa = 'fechado' and new.etapa = 'fechado' then
      if new.desfecho    is distinct from old.desfecho
      or new.motivo_id   is distinct from old.motivo_id
      or new.plano_id    is distinct from old.plano_id
      or new.fechado_em  is distinct from old.fechado_em
      or new.vendedor_id is distinct from old.vendedor_id then
        raise exception 'Ticket fechado não pode ser alterado. Reabra o ticket para tratar de novo (PRD 3.9).'
          using errcode = 'restrict_violation';
      end if;
    end if;

    -- Reabertura limpa o desfecho para o fechamento voltar a ser obrigatório.
    if old.etapa = 'fechado' and new.etapa <> 'fechado' then
      new.desfecho    := null;
      new.fechado_em  := null;
      new.fechado_por := null;
      new.motivo_id   := null;
    end if;
  end if;

  if new.etapa = 'fechado' and new.fechado_em is null then
    new.fechado_em := now();
  end if;

  return new;
end;
$$;

create trigger tickets_antes_de_gravar before insert or update on tickets
  for each row execute function app.ticket_antes_de_gravar();

-- ---------------------------------------------------------------------
-- tickets: trilha de auditoria automática
-- ---------------------------------------------------------------------
create or replace function app.ticket_registra_evento() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_eventos (ticket_id, tipo, dados, usuario_id)
    values (new.id, 'criacao',
            jsonb_build_object('origem_criacao', new.origem_criacao, 'etapa', new.etapa),
            auth.uid());
    return new;
  end if;

  if new.etapa is distinct from old.etapa then
    insert into ticket_eventos (ticket_id, tipo, dados, usuario_id)
    values (new.id,
            case
              when new.etapa = 'fechado'  then 'fechamento'::tipo_evento_ticket
              when old.etapa = 'fechado'  then 'reabertura'::tipo_evento_ticket
              else 'mudanca_etapa'::tipo_evento_ticket
            end,
            jsonb_build_object('de', old.etapa, 'para', new.etapa,
                               'desfecho', new.desfecho, 'motivo_id', new.motivo_id,
                               'fechado_por', new.fechado_por),
            auth.uid());
  end if;

  if new.vendedor_id is distinct from old.vendedor_id then
    insert into ticket_eventos (ticket_id, tipo, dados, usuario_id)
    values (new.id, 'reatribuicao',
            jsonb_build_object('de', old.vendedor_id, 'para', new.vendedor_id), auth.uid());
  end if;

  if new.contrato_id is distinct from old.contrato_id then
    insert into ticket_eventos (ticket_id, tipo, dados, usuario_id)
    values (new.id, 'reconciliacao',
            jsonb_build_object('contrato_id', new.contrato_id), auth.uid());
  end if;

  return new;
end;
$$;

create trigger tickets_registra_evento after insert or update on tickets
  for each row execute function app.ticket_registra_evento();

-- ---------------------------------------------------------------------
-- comissões: snapshot imutável (PRD seção 6)
-- ---------------------------------------------------------------------
create or replace function app.comissao_imutavel() returns trigger
language plpgsql as $$
begin
  if new.snapshot is distinct from old.snapshot or new.valor_total is distinct from old.valor_total then
    raise exception 'Fechamento de comissão é imutável. Recálculo exige novo fechamento explícito (PRD seção 6).'
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

create trigger comissoes_imutaveis before update on comissoes_fechadas
  for each row execute function app.comissao_imutavel();

-- ---------------------------------------------------------------------
-- Views de leitura (security_invoker: respeitam a RLS de quem consulta).
-- As views materializadas de agregação (mv_vendas_diarias, mv_safras_churn,
-- mv_funil) entram na Fase 1 junto com o worker que as atualiza.
-- ---------------------------------------------------------------------
create or replace view vw_esteira
with (security_invoker = true) as
select
  c.id,
  c.sgp_contrato_id,
  cl.nome as cliente_nome,
  cl.bairro,
  c.vendedor_id,
  v.nome as vendedor_nome,
  c.pop_id,
  p.nome as pop_nome,
  pl.nome as plano_nome,
  c.valor_mensalidade,
  c.data_venda,
  c.data_assinatura,
  c.data_ativacao,
  c.status,
  case
    when c.status = 'cancelado'        then 'cancelado'
    when c.data_ativacao is not null   then 'instalada'
    when c.data_assinatura is not null then 'aguardando_instalacao'
    else 'pendente_assinatura'
  end as etapa_esteira,
  (current_date - coalesce(c.data_assinatura, c.data_venda)) as dias_na_etapa
from contratos c
join clientes cl on cl.id = c.cliente_id
left join vendedores v on v.id = c.vendedor_id
left join pops p on p.id = c.pop_id
left join planos pl on pl.id = c.plano_id;

create or replace view vw_ultima_sync
with (security_invoker = true) as
select distinct on (entidade)
  entidade, iniciado_em, finalizado_em, registros, status, erro
from sync_runs
order by entidade, iniciado_em desc;

-- ---------------------------------------------------------------------
-- Permissões: quem autoriza de fato é a RLS; estes grants apenas abrem as
-- views e funções para os papéis do Supabase.
-- ---------------------------------------------------------------------
grant select on vw_esteira, vw_ultima_sync to authenticated;
grant execute on all functions in schema app to authenticated;
