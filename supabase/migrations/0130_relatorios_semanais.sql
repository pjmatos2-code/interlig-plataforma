-- =====================================================================
-- 0130: Relatório Comercial Semanal da diretoria (04/11/2026).
--
-- Pedido do Paulo: a própria plataforma monta, toda semana, o relatório que
-- a diretoria (CEO) usa na reunião de segunda, no formato do modelo
-- aprovado (placar de 10 indicadores, seções, insights e perguntas).
--
-- Um relatório por semana (segunda a domingo). `dados` guarda os números
-- lidos do banco na hora de gerar e `textos` os textos que o Claude escreve
-- a partir deles — os dois ficam congelados. `reuniao` guarda o que se
-- digita na reunião (respostas, checklist); o checklist de uma semana vira
-- o "combinado" da seguinte. `token` é para o link sem login (etapa do
-- e-mail).
--
-- Só a service role lê e grava (RLS ligada e sem política): as telas checam
-- o perfil (gestor e direção) antes.
-- =====================================================================

create table if not exists public.relatorios_semanais (
  id              uuid primary key default gen_random_uuid(),
  semana_inicio   date not null unique check (extract(isodow from semana_inicio) = 1),
  semana_fim      date not null,
  dados           jsonb not null,
  textos          jsonb,
  textos_erro     text,
  reuniao         jsonb not null default '{}'::jsonb,
  token           text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  gerado_em       timestamptz not null default now(),
  gerado_por      uuid references public.usuarios(id) on delete set null,
  reuniao_em      timestamptz,
  reuniao_por     uuid references public.usuarios(id) on delete set null,
  check (semana_fim = semana_inicio + 6)
);

alter table public.relatorios_semanais enable row level security;

comment on table public.relatorios_semanais is
  'Relatório Comercial Semanal da diretoria: números (dados) e textos congelados na geração, e o que se digitou na reunião. Só a service role lê.';

-- grava um campo da reunião sem perder os outros (dois campos salvos ao
-- mesmo tempo não se atropelam)
create or replace function public.relatorio_reuniao_campo(p_id uuid, p_campo text, p_valor text, p_usuario uuid)
returns void
language sql
as $$
  update public.relatorios_semanais
     set reuniao = case
                     when coalesce(p_valor, '') = '' then reuniao - p_campo
                     else jsonb_set(reuniao, array[p_campo], to_jsonb(p_valor), true)
                   end,
         reuniao_em = now(),
         reuniao_por = p_usuario
   where id = p_id;
$$;

revoke all on function public.relatorio_reuniao_campo(uuid, text, text, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
