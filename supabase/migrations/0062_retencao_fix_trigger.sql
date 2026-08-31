-- 0062: a auditoria (service role / conexão de serviço) precisa carimbar
-- retido/perdido — a trava vale para USUÁRIOS logados (a agente), não para o
-- serviço. Sem auth.uid() não há sessão de usuário: é o backend auditando.
create or replace function app.retencao_protege_desfecho() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or app.eh_gestor() then
    new.atualizado_em := now();
    return new;
  end if;
  if new.desfecho in ('retido', 'perdido')
     and new.desfecho is distinct from old.desfecho then
    raise exception 'Retido e perdido são definidos pela auditoria (status no SGP), não manualmente.';
  end if;
  if new.desfecho = 'irreversivel' and coalesce(new.irreversivel_motivo, '') = '' then
    raise exception 'Mover para irreversível exige o motivo.';
  end if;
  new.atualizado_em := now();
  return new;
end $$;
