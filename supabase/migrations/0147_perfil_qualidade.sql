-- 0147: perfil "qualidade" (25/11/2026): o setor de Qualidade do call center
-- acompanha a Operação Técnica (módulo completo, as três unidades), só consulta.
--
-- (1) perfil novo
alter type perfil_usuario add value if not exists 'qualidade';

-- (2) quem é da Qualidade (texto: o valor novo do tipo não pode ser usado na
-- mesma transação em que nasce)
create or replace function app.eh_qualidade() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios u where u.id = auth.uid() and u.perfil::text = 'qualidade')
$$;

-- (3) tabelas que qualquer pessoa logada lê: a Qualidade não. As páginas da
-- Operação leem pelo servidor, depois de conferir o acesso; nada disto é usado
-- pelo navegador dela. Política restritiva: soma às que existem, não libera nada.
do $$
declare t text;
begin
  foreach t in array array['comissao_competencia_config','comissao_liberacoes','comissao_sgp_itens','coordenadores_extras','credores_conhecidos','crescimento_base','fidelidade_resumo','os_instalacao','regras_comissao','score_regua','tecnica_os_aprovadas','vendedores'] loop
    execute format('drop policy if exists %I on public.%I', t || '_sem_qualidade', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (not (select app.eh_qualidade()))', t || '_sem_qualidade', t);
  end loop;
end $$;

-- (4) fora do InterChat: não lista pessoas, não é listada e não entra em conversa
create or replace function public.chat_pessoas()
returns table (id uuid, nome text, perfil text, foto text)
language sql stable security definer set search_path = public as $$
  select u.id, u.nome, u.perfil::text, coalesce(v.foto_url, u.foto_url)
    from public.usuarios u
    left join public.vendedores v on v.id = u.vendedor_id
   where u.ativo and u.id <> auth.uid() and auth.uid() is not null
     and u.perfil::text <> 'qualidade' and not app.eh_qualidade()
   order by u.nome
$$;

create or replace function app.chat_sem_qualidade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.usuarios u where u.id = new.usuario_id and u.perfil::text = 'qualidade') then
    raise exception 'Este perfil não usa o InterChat.';
  end if;
  return new;
end $$;
drop trigger if exists chat_sem_qualidade on public.chat_membros;
create trigger chat_sem_qualidade before insert on public.chat_membros for each row execute function app.chat_sem_qualidade();

notify pgrst, 'reload schema';
