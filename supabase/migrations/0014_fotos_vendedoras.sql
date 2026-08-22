-- 0014: foto de perfil das vendedoras (totem/ranking) + bucket público
alter table vendedores add column if not exists foto_url text;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;
