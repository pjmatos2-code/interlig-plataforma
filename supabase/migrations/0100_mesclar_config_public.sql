-- =====================================================================
-- 0100: mesclar_config alcançável pelo PostgREST (30/09/2026).
--
-- A 0086 criou app.mesclar_config, mas o supabase-js chama rpc() no
-- schema PUBLIC — o PostgREST devolvia PGRST202 e o código não checava o
-- erro: desde 18/09 TODAS as escritas de marcador falhavam em silêncio
-- (cadência dos robôs, cursor da varredura da URA, marcador do
-- crescimento_base — a causa dos status defasados e do crescimento_base
-- rodando a cada ciclo até ser 'interrompido').
--
-- Wrapper fino em public, só para a service role.
-- =====================================================================

create or replace function public.mesclar_config(p_sistema text, p_patch jsonb)
returns void
language sql security definer
set search_path = public, app, pg_temp as $$
  select app.mesclar_config(p_sistema, p_patch)
$$;

revoke all on function public.mesclar_config(text, jsonb) from public;
revoke all on function public.mesclar_config(text, jsonb) from anon;
revoke all on function public.mesclar_config(text, jsonb) from authenticated;
grant execute on function public.mesclar_config(text, jsonb) to service_role;

notify pgrst, 'reload schema';
