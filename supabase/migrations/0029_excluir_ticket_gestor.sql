-- =====================================================================
-- 0029: exclusão de ticket restrita ao Administrador (gestor).
-- A regra do PRD 3.9 (ticket não se exclui) continua valendo para todos os
-- perfis; abre-se apenas uma exceção administrativa para limpeza (ex.: apagar
-- tickets de teste). O gatilho de bloqueio passa a permitir quando quem executa
-- é gestor; e criam-se políticas RLS de DELETE só para gestor nas tabelas do
-- ticket e seus filhos (eventos, propostas, visitas externas).
-- =====================================================================
create or replace function app.bloqueia_exclusao() returns trigger
language plpgsql as $$
begin
  if app.eh_gestor() then
    return old; -- Administrador pode excluir (limpeza administrativa)
  end if;
  raise exception 'Registro de % não pode ser excluído (PRD 3.9).', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- Políticas de DELETE (apenas gestor)
drop policy if exists tickets_del on tickets;
create policy tickets_del on tickets for delete to authenticated
  using (app.eh_gestor());

drop policy if exists eventos_del on ticket_eventos;
create policy eventos_del on ticket_eventos for delete to authenticated
  using (app.eh_gestor());

drop policy if exists propostas_del on ticket_propostas;
create policy propostas_del on ticket_propostas for delete to authenticated
  using (app.eh_gestor());

drop policy if exists visitas_del on visitas_externas;
create policy visitas_del on visitas_externas for delete to authenticated
  using (app.eh_gestor());
