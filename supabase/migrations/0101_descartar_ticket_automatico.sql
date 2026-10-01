-- =====================================================================
-- 0101: descarte do ticket AUTOMÁTICO duplicado (01/10/2026).
--
-- A venda direta no SGP gera um ticket `sgp_auto`; se a vendedora depois
-- fecha o ticket da conversa na mesma venda, os dois apontam para o mesmo
-- contrato e a venda conta em dobro na conversão. O automático (sem
-- interação humana) é descartado; o da conversa fica.
--
-- A trava "ticket não se exclui" (0003/0029/0040) continua valendo para
-- todos — a exceção é só desta função de sistema, que liga um marcador de
-- transação lido pelo gatilho. Ninguém além da service role executa.
-- =====================================================================

create or replace function app.bloqueia_exclusao() returns trigger
language plpgsql as $$
begin
  if app.eh_gestor() or current_setting('app.exclusao_sistema', true) = 'on' then
    if tg_op = 'UPDATE' then
      return new;
    end if;
    return old;
  end if;
  raise exception 'Registro de % não pode ser excluído (PRD 3.9).', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

create or replace function public.descartar_ticket_automatico(p_ticket_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, app, pg_temp as $$
declare
  v_contrato uuid;
begin
  -- só ticket automático do SGP...
  select contrato_id into v_contrato
  from tickets
  where id = p_ticket_id and origem_criacao = 'sgp_auto' and contrato_id is not null;
  if v_contrato is null then return false; end if;

  -- ...que tenha um ticket real (conversa/manual/site) no mesmo contrato...
  if not exists (
    select 1 from tickets
    where contrato_id = v_contrato and id <> p_ticket_id and origem_criacao <> 'sgp_auto'
  ) then return false; end if;

  -- ...e em que nenhuma pessoa tenha mexido (nota, proposta, visita)
  if exists (select 1 from ticket_eventos where ticket_id = p_ticket_id and usuario_id is not null)
     or exists (select 1 from ticket_propostas where ticket_id = p_ticket_id)
     or exists (select 1 from visitas_externas where ticket_id = p_ticket_id)
  then return false; end if;

  perform set_config('app.exclusao_sistema', 'on', true);
  delete from ticket_eventos where ticket_id = p_ticket_id;
  delete from tickets where id = p_ticket_id;
  perform set_config('app.exclusao_sistema', 'off', true);
  return true;
end;
$$;

revoke all on function public.descartar_ticket_automatico(uuid) from public, anon, authenticated;
grant execute on function public.descartar_ticket_automatico(uuid) to service_role;

notify pgrst, 'reload schema';
