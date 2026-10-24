-- 0125 — follow-ups: chave única "de verdade" para o upsert idempotente
-- (24/10/2026). O índice parcial (where chave is not null) não serve de alvo
-- para ON CONFLICT via PostgREST; a constraint única aceita vários NULL.
drop index if exists public.followups_chave_idx;
alter table public.followups add constraint followups_chave_uk unique (chave);
