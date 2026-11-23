-- 0144: acesso aos módulos por usuário (23/11/2026).
--
-- O padrão continua vindo do perfil (lib/acessos.ts). Esta tabela guarda só os
-- ajustes: liberar ou bloquear um módulo para uma pessoa e, quando for o caso,
-- prender a pessoa a uma unidade (pop_id). Quem altera é a administração.
create table if not exists public.usuario_modulos (
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  modulo text not null check (modulo in ('operacao', 'grr_tecnico', 'grr_comercial')),
  permitido boolean not null,
  pop_id uuid references public.pops (id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios (id) on delete set null,
  primary key (usuario_id, modulo),
  check (permitido or pop_id is null)
);
comment on table public.usuario_modulos is 'Ajustes de acesso aos módulos por usuário (o padrão vem do perfil). Alterado pela administração.';

alter table public.usuario_modulos enable row level security;
drop policy if exists usuario_modulos_sel on public.usuario_modulos;
create policy usuario_modulos_sel on public.usuario_modulos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select app.eh_gestor()));
drop policy if exists usuario_modulos_ins on public.usuario_modulos;
create policy usuario_modulos_ins on public.usuario_modulos for insert to authenticated with check ((select app.eh_gestor()));
drop policy if exists usuario_modulos_upd on public.usuario_modulos;
create policy usuario_modulos_upd on public.usuario_modulos for update to authenticated using ((select app.eh_gestor())) with check ((select app.eh_gestor()));
drop policy if exists usuario_modulos_del on public.usuario_modulos;
create policy usuario_modulos_del on public.usuario_modulos for delete to authenticated using ((select app.eh_gestor()));

-- decisão da gestão em 23/11/2026:
--  Aline Moraes (Brasil Novo) e Railson (Vitória do Xingu): Operação Técnica,
--  GRR Técnico e GRR Comercial da própria unidade;
--  Rayssa: só a Operação Técnica (todas as unidades), sem o GRR Comercial.
insert into public.usuario_modulos (usuario_id, modulo, permitido, pop_id)
select u.id, m.modulo, true, u.pop_id
from public.usuarios u
cross join (values ('operacao'), ('grr_tecnico'), ('grr_comercial')) as m(modulo)
where u.nome in ('Aline Moraes', 'Railson') and u.pop_id is not null
on conflict (usuario_id, modulo) do nothing;

insert into public.usuario_modulos (usuario_id, modulo, permitido, pop_id)
select u.id, m.modulo, m.permitido, null
from public.usuarios u
cross join (values ('operacao', true), ('grr_comercial', false)) as m(modulo, permitido)
where u.nome = 'Rayssa'
on conflict (usuario_id, modulo) do nothing;

notify pgrst, 'reload schema';
