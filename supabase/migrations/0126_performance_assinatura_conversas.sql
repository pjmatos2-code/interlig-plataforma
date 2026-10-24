-- 0126 — Performance Comercial: assinatura das conversas para a fila da IA
-- (24/10/2026). Aditiva. Total de mensagens e id da última, por conversa:
-- se nada mudou, a análise não é refeita. Execução só pelo service role.
create or replace function public.performance_assinatura_conversas(p_ids uuid[])
returns table (conversa_id uuid, total integer, ultima text)
language sql stable set search_path = public as $$
  select m.conversa_id,
         count(*)::int as total,
         (array_agg(m.externo_id order by m.ordem desc))[1] as ultima
    from public.conversas_mensagens m
   where m.conversa_id = any(p_ids)
   group by m.conversa_id
$$;
revoke all on function public.performance_assinatura_conversas(uuid[]) from public, anon, authenticated;
grant execute on function public.performance_assinatura_conversas(uuid[]) to service_role;
