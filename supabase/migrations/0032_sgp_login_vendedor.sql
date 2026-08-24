-- =====================================================================
-- 0032: identificação automática do vendedor pelo painel do SGP.
-- O leitor de painel extrai "Nome - login" (ex.: Karoline Moraes -
-- karoline.xavier) da página do serviço; o login é a chave estável de
-- mapeamento para a vendedora da plataforma.
-- =====================================================================
alter table vendedores add column if not exists sgp_login text;
create unique index if not exists vendedores_sgp_login_idx
  on vendedores (sgp_login) where sgp_login is not null;

-- semeadura best-effort pelo primeiro nome (ex.: karoline.xavier -> Karoline);
-- o que não casar fica para o gestor mapear na tela de administração.
update vendedores v
set sgp_login = null
where false; -- no-op: mantém a migração idempotente (semeadura fica no leitor)
