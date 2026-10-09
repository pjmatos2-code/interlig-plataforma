-- 0108: técnico passa a receber suporte a partir de uma competência
-- (09/10/2026 — Raygleison era instalador e passou a fazer suporte em
-- outubro). Sem data = regra antiga (vale para todos os meses).
alter table public.tecnicos add column if not exists recebe_suporte_desde date;
notify pgrst, 'reload schema';
