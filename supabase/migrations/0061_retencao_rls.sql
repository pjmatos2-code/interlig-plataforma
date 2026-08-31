-- 0061: RLS da agente de retenção (separado: enum novo não pode ser usado na
-- mesma transação que o cria — nem dentro do corpo de função criada junto).

create or replace function app.eh_agente_retencao() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.perfil = 'agente_retencao' and u.ativo
   ) $$;
drop policy if exists casos_ret_agente on casos_retencao;
create policy casos_ret_agente on casos_retencao for select to authenticated
  using (
    app.eh_agente_retencao()
    and lower(agente_login) = (
      select lower(v.sgp_login) from vendedores v
      join usuarios u on u.vendedor_id = v.id where u.id = auth.uid()
    )
  );

-- ela edita a tratativa dos próprios casos; o desfecho automático é protegido
-- pelo trigger abaixo, não pela política
drop policy if exists casos_ret_agente_upd on casos_retencao;
create policy casos_ret_agente_upd on casos_retencao for update to authenticated
  using (
    app.eh_agente_retencao()
    and lower(agente_login) = (
      select lower(v.sgp_login) from vendedores v
      join usuarios u on u.vendedor_id = v.id where u.id = auth.uid()
    )
  );

drop policy if exists casos_ret_agente_ins on casos_retencao;
create policy casos_ret_agente_ins on casos_retencao for insert to authenticated
  with check (app.eh_agente_retencao() or app.eh_gestor());

-- a agente NUNCA grava 'retido' ou 'perdido': esses dois são carimbo da
-- auditoria (service role) ou decisão do gestor. É o coração do modelo.
create or replace function app.retencao_protege_desfecho() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if app.eh_gestor() then return new; end if;
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

drop trigger if exists trg_retencao_desfecho on casos_retencao;
create trigger trg_retencao_desfecho before update on casos_retencao
  for each row execute function app.retencao_protege_desfecho();
