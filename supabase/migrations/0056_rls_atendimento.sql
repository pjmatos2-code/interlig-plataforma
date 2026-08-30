-- 0056: RLS do perfil agente_atendimento (arquivo separado — o Postgres não
-- deixa usar um valor de enum na mesma transação em que ele foi criado).
create or replace function app.eh_agente_atendimento() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.perfil = 'agente_atendimento' and u.ativo
   ) $$;

-- ela lê o próprio cadastro de agente (para a tela saber o login do SGP)
drop policy if exists vendedores_sel_atendimento on vendedores;
create policy vendedores_sel_atendimento on vendedores for select to authenticated
  using (
    app.eh_agente_atendimento()
    and id = (select u.vendedor_id from usuarios u where u.id = auth.uid())
  );
