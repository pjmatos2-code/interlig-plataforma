-- 0071: decisões do gestor (01/09/2026) sobre o fechamento técnico de agosto.
--
-- 1) Lucas Umbuzeiro entra no comissionamento (ATM, suporte habilitado).
insert into tecnicos (nome, unidade, recebe_suporte, nome_sgp)
select 'Lucas Umbuzeiro', 'atm', true, 'Lucas Souza Bogéa Umbuzeiro'
where not exists (select 1 from tecnicos where nome = 'Lucas Umbuzeiro');

-- 2) Ajustes manuais por competência (o Hitalo de agosto recebe pelas 67 OS
--    de julho listadas na planilha do fechamento — substituição do cálculo).
create table if not exists ajustes_tecnica (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  tecnico_id uuid not null references tecnicos(id),
  modo text not null check (modo in ('somar', 'substituir')),
  valor numeric not null,
  motivo text not null,
  criado_em timestamptz not null default now(),
  unique (competencia, tecnico_id)
);
alter table ajustes_tecnica enable row level security;
drop policy if exists ajustes_tecnica_sel on ajustes_tecnica;
create policy ajustes_tecnica_sel on ajustes_tecnica for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro());

insert into ajustes_tecnica (competencia, tecnico_id, modo, valor, motivo)
select '2026-08-01', t.id, 'substituir', 2010,
  'Pagar as 67 OS de julho conforme planilha do fechamento (aba não virou o mês) — decisão do gestor em 01/09/2026.'
from tecnicos t where t.nome = 'Hitalo Adrison'
on conflict (competencia, tecnico_id) do nothing;
