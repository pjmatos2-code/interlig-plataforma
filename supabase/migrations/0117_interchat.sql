-- =====================================================================
-- 0117: InterChat — chat interno (16/10/2026).
-- Decisões do gestor: todos conversam com todos; só o ADMINISTRADOR cria
-- grupos; conversas PRIVADAS (nem a gestão lê — a RLS não tem exceção para
-- gestor); histórico guardado para sempre; aviso em todos os dispositivos
-- (web push).
-- =====================================================================

create table if not exists public.chat_conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta', 'grupo')),
  nome text,
  -- conversa direta: "menor_id|maior_id" — uma só por par de pessoas
  chave_direta text unique,
  criado_por uuid references public.usuarios(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  ultima_mensagem text,
  ultimo_autor_id uuid references public.usuarios(id) on delete set null,
  check (tipo = 'grupo' and nome is not null and chave_direta is null
      or tipo = 'direta' and chave_direta is not null)
);

create table if not exists public.chat_membros (
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  lido_ate timestamptz not null default now(),
  primary key (conversa_id, usuario_id)
);
create index if not exists chat_membros_usuario_idx on public.chat_membros (usuario_id);

create table if not exists public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  autor_id uuid not null references public.usuarios(id) on delete restrict,
  texto text,
  anexo_path text,
  anexo_nome text,
  anexo_tipo text,
  anexo_tamanho integer,
  criado_em timestamptz not null default now(),
  check (coalesce(trim(texto), '') <> '' or anexo_path is not null),
  check (length(coalesce(texto, '')) <= 4000)
);
create index if not exists chat_mensagens_conversa_idx on public.chat_mensagens (conversa_id, criado_em desc);

-- inscrições de notificação (web push) — um navegador/dispositivo por linha
create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz
);
create index if not exists push_inscricoes_usuario_idx on public.push_inscricoes (usuario_id);

-- ---------------------------------------------------------------------
-- quem participa (security definer: evita recursão de RLS em chat_membros)
create or replace function app.chat_eh_membro(p_conversa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_membros where conversa_id = p_conversa and usuario_id = auth.uid())
$$;

alter table public.chat_conversas enable row level security;
alter table public.chat_membros enable row level security;
alter table public.chat_mensagens enable row level security;
alter table public.push_inscricoes enable row level security;

drop policy if exists chat_conversas_sel on public.chat_conversas;
create policy chat_conversas_sel on public.chat_conversas for select to authenticated using (app.chat_eh_membro(id));
drop policy if exists chat_membros_sel on public.chat_membros;
create policy chat_membros_sel on public.chat_membros for select to authenticated using (app.chat_eh_membro(conversa_id));
drop policy if exists chat_mensagens_sel on public.chat_mensagens;
create policy chat_mensagens_sel on public.chat_mensagens for select to authenticated using (app.chat_eh_membro(conversa_id));
drop policy if exists chat_mensagens_ins on public.chat_mensagens;
create policy chat_mensagens_ins on public.chat_mensagens for insert to authenticated
  with check (autor_id = auth.uid() and app.chat_eh_membro(conversa_id));
drop policy if exists push_inscricoes_proprias on public.push_inscricoes;
create policy push_inscricoes_proprias on public.push_inscricoes for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- prévia da conversa e ordem da lista
create or replace function app.chat_atualiza_conversa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversas
     set atualizado_em = new.criado_em,
         ultima_mensagem = coalesce(nullif(left(trim(new.texto), 140), ''), '📎 ' || coalesce(new.anexo_nome, 'anexo')),
         ultimo_autor_id = new.autor_id
   where id = new.conversa_id;
  -- quem escreve leu até ali
  update public.chat_membros set lido_ate = new.criado_em
   where conversa_id = new.conversa_id and usuario_id = new.autor_id;
  return new;
end $$;
drop trigger if exists chat_mensagens_atualiza on public.chat_mensagens;
create trigger chat_mensagens_atualiza after insert on public.chat_mensagens
  for each row execute function app.chat_atualiza_conversa();

-- ---------------------------------------------------------------------
-- RPCs (security definer, sempre a partir de auth.uid())

-- pessoas para nova conversa (ativas, menos a própria)
create or replace function public.chat_pessoas()
returns table (id uuid, nome text, perfil text, foto text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.perfil::text, v.foto_url
    from public.usuarios u
    left join public.vendedores v on v.id = u.vendedor_id
   where u.ativo and u.id <> auth.uid() and auth.uid() is not null
   order by u.nome
$$;

-- abre (ou reaproveita) a conversa direta com outra pessoa
create or replace function public.chat_abrir_direta(p_outro uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eu uuid := auth.uid();
  chave text;
  cid uuid;
begin
  if eu is null then raise exception 'sem sessão'; end if;
  if p_outro = eu then raise exception 'escolha outra pessoa'; end if;
  if not exists (select 1 from public.usuarios where id = p_outro and ativo) then raise exception 'pessoa inativa'; end if;
  chave := least(eu::text, p_outro::text) || '|' || greatest(eu::text, p_outro::text);
  select id into cid from public.chat_conversas where chave_direta = chave;
  if cid is null then
    insert into public.chat_conversas (tipo, chave_direta, criado_por) values ('direta', chave, eu)
      on conflict (chave_direta) do nothing returning id into cid;
    if cid is null then select id into cid from public.chat_conversas where chave_direta = chave; end if;
    insert into public.chat_membros (conversa_id, usuario_id) values (cid, eu), (cid, p_outro) on conflict do nothing;
  end if;
  return cid;
end $$;

-- lista de conversas de quem está logado, com não lidas e o "outro" da direta
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
         o.usuario_id, ou.nome, ov.foto_url, o.lido_ate,
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

create or replace function public.chat_marcar_lido(p_conversa uuid) returns void
language sql security definer set search_path = public as $$
  update public.chat_membros set lido_ate = now() where conversa_id = p_conversa and usuario_id = auth.uid()
$$;

-- grupos: só o administrador cria e mexe nos membros
create or replace function public.chat_criar_grupo(p_nome text, p_membros uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not app.eh_gestor() then raise exception 'Só o administrador cria grupos.'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Dê um nome ao grupo.'; end if;
  insert into public.chat_conversas (tipo, nome, criado_por) values ('grupo', trim(p_nome), auth.uid()) returning id into cid;
  insert into public.chat_membros (conversa_id, usuario_id)
    select cid, x from unnest(array_append(p_membros, auth.uid())) x
     where exists (select 1 from public.usuarios u where u.id = x and u.ativo)
    on conflict do nothing;
  return cid;
end $$;

create or replace function public.chat_membros_grupo(p_conversa uuid, p_adicionar uuid[], p_remover uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not app.eh_gestor() then raise exception 'Só o administrador mexe nos grupos.'; end if;
  if not exists (select 1 from public.chat_conversas where id = p_conversa and tipo = 'grupo') then raise exception 'grupo não encontrado'; end if;
  insert into public.chat_membros (conversa_id, usuario_id)
    select p_conversa, x from unnest(coalesce(p_adicionar, '{}')) x
     where exists (select 1 from public.usuarios u where u.id = x and u.ativo)
    on conflict do nothing;
  delete from public.chat_membros where conversa_id = p_conversa and usuario_id = any(coalesce(p_remover, '{}'));
end $$;

revoke all on function public.chat_pessoas(), public.chat_abrir_direta(uuid), public.chat_minhas_conversas(),
  public.chat_marcar_lido(uuid), public.chat_criar_grupo(text, uuid[]), public.chat_membros_grupo(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.chat_pessoas(), public.chat_abrir_direta(uuid), public.chat_minhas_conversas(),
  public.chat_marcar_lido(uuid), public.chat_criar_grupo(text, uuid[]), public.chat_membros_grupo(uuid, uuid[], uuid[]) to authenticated;
grant execute on function app.chat_eh_membro(uuid) to authenticated;

-- tempo real (a RLS de select vale também para o realtime)
do $$ begin
  begin alter publication supabase_realtime add table public.chat_mensagens; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_membros; exception when duplicate_object then null; end;
end $$;

-- anexos: bucket privado (link assinado só para quem participa)
insert into storage.buckets (id, name, public, file_size_limit)
values ('interchat', 'interchat', false, 10485760)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
