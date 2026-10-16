-- InterChat: cada pessoa troca a própria foto (16/10/2026).
-- Quem tem cadastro de vendedora continua com a foto de lá (uma foto só);
-- os demais (gestão, supervisão, direção…) guardam aqui.
alter table public.usuarios add column if not exists foto_url text;

create or replace function public.chat_pessoas()
returns table (id uuid, nome text, perfil text, foto text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.perfil::text, coalesce(v.foto_url, u.foto_url)
    from public.usuarios u
    left join public.vendedores v on v.id = u.vendedor_id
   where u.ativo and u.id <> auth.uid() and auth.uid() is not null
   order by u.nome
$$;

create or replace function public.chat_minhas_conversas()
returns table (
  id uuid, tipo text, nome text, atualizado_em timestamptz, ultima_mensagem text,
  ultimo_autor_id uuid, nao_lidas integer, outro_id uuid, outro_nome text, outro_foto text,
  outro_lido_ate timestamptz, membros integer
)
language sql stable security definer set search_path = public as $$
  select c.id, c.tipo, c.nome, c.atualizado_em, c.ultima_mensagem, c.ultimo_autor_id,
         (select count(*)::int from public.chat_mensagens m
           where m.conversa_id = c.id and m.criado_em > eu.lido_ate and m.autor_id <> auth.uid()),
         o.usuario_id, ou.nome, coalesce(ov.foto_url, ou.foto_url), o.lido_ate,
         (select count(*)::int from public.chat_membros x where x.conversa_id = c.id)
    from public.chat_membros eu
    join public.chat_conversas c on c.id = eu.conversa_id
    left join lateral (
      select mm.usuario_id, mm.lido_ate from public.chat_membros mm
       where c.tipo = 'direta' and mm.conversa_id = c.id and mm.usuario_id <> auth.uid() limit 1
    ) o on true
    left join public.usuarios ou on ou.id = o.usuario_id
    left join public.vendedores ov on ov.id = ou.vendedor_id
   where eu.usuario_id = auth.uid()
     and (c.tipo = 'grupo' or exists (select 1 from public.chat_mensagens m2 where m2.conversa_id = c.id) or c.criado_por = auth.uid())
   order by c.atualizado_em desc
$$;
