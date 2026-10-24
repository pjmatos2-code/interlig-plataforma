-- 0124 — Performance Comercial: mensagens por hora do dia (24/10/2026). Aditiva.
-- Agrega no banco (milhares de mensagens/mês) para o gráfico de distribuição
-- de atividade × demanda. Só leitura; execução restrita ao service role
-- (as tabelas também não têm policy de leitura).
create or replace function public.performance_mensagens_por_hora(p_de timestamptz, p_ate timestamptz, p_vendedores uuid[])
returns table (hora integer, autor text, qtd bigint)
language sql stable set search_path = public as $$
  select extract(hour from (m.enviada_em at time zone 'America/Santarem'))::int as hora,
         m.autor,
         count(*) as qtd
    from public.conversas_mensagens m
    join public.conversas_atendimento c on c.id = m.conversa_id
   where m.enviada_em between p_de and p_ate
     and m.autor in ('cliente', 'agente')
     and (
       (m.autor = 'agente' and (p_vendedores is null or m.vendedor_id = any(p_vendedores)))
       or (m.autor = 'cliente' and (p_vendedores is null or c.vendedor_id = any(p_vendedores)))
     )
   group by 1, 2
$$;
revoke all on function public.performance_mensagens_por_hora(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.performance_mensagens_por_hora(timestamptz, timestamptz, uuid[]) to service_role;
