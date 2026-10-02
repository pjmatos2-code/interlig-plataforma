-- 0104: quantos contratos o resumo de fidelidade deixa de fora (permutas,
-- isentos e órgãos públicos — decisão do gestor em 01/10/2026). O link do SGP
-- não consegue excluí-los, então a tela mostra a diferença.
alter table public.fidelidade_resumo add column if not exists excluidos integer not null default 0;
notify pgrst, 'reload schema';
