-- =====================================================================
-- 0107: novos motivos de não conversão (gestor, 03/10/2026).
--
-- "Outra cidade": cliente fora das unidades atendidas — a vendedora informa
-- a cidade (tickets.cidade_fora_area) para medir a demanda por expansão.
-- "Recusou o adiantamento": aprovado com condição na análise de crédito
-- (adiantamento de fatura) e não aceitou — diferente de "Crédito reprovado".
-- =====================================================================

alter table public.tickets add column if not exists cidade_fora_area text;

insert into public.motivos_nao_conversao (nome, ativo, ordem)
select v.nome, true, v.ordem
from (values ('Outra cidade', 4), ('Recusou o adiantamento', 7)) as v(nome, ordem)
where not exists (select 1 from public.motivos_nao_conversao m where m.nome = v.nome);

-- ordem da lista que a vendedora vê
update public.motivos_nao_conversao set ordem = case nome
  when 'Preço' then 1
  when 'Concorrente' then 2
  when 'Inviabilidade técnica' then 3
  when 'Outra cidade' then 4
  when 'Desistência' then 5
  when 'Crédito reprovado' then 6
  when 'Recusou o adiantamento' then 7
  when 'Sem resposta' then 8
  when 'Outro' then 9
  else ordem end;

notify pgrst, 'reload schema';
