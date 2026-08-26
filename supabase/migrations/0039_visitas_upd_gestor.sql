-- 0039: correcao administrativa de visitas (ex.: setor errado) — so o gestor.
-- O gatilho visitas_sem_update ja permite gestor (0029); faltava a policy.
drop policy if exists visitas_upd_gestor on visitas_externas;
create policy visitas_upd_gestor on visitas_externas for update to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());
