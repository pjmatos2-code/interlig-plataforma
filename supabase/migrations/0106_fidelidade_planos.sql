-- 0106: contagem por plano (velocidade + residencial/corporativo) em cada
-- unidade/faixa do resumo de fidelidade — gráfico "planos sem fidelidade".
alter table public.fidelidade_resumo add column if not exists planos jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
