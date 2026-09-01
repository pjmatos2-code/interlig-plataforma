-- 0073: RLS do gestor técnico (valor de enum precisa estar commitado antes
-- de ser referenciado — por isso a migração separada da 0072).
create or replace function app.eh_gestor_tecnico() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from usuarios u
     where u.id = auth.uid() and u.ativo and u.perfil = 'gestor_tecnico'
   ) $$;

drop policy if exists tecnicos_sel on tecnicos;
create policy tecnicos_sel on tecnicos for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro() or app.eh_gestor_tecnico());
drop policy if exists os_tecnicas_sel on os_tecnicas;
create policy os_tecnicas_sel on os_tecnicas for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro() or app.eh_gestor_tecnico());
drop policy if exists ajustes_tecnica_sel on ajustes_tecnica;
create policy ajustes_tecnica_sel on ajustes_tecnica for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro() or app.eh_gestor_tecnico());
