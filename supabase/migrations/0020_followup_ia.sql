-- 0020: resumo de tratativa + continuidade + urgência no ticket (D2)
-- Alimentado pela leitura das conversas do SZ; o webhook preenche daqui
-- pra frente e a vendedora vê na aba "Follow-ups pendentes" do CRM.
alter table tickets add column if not exists resumo_tratativa text;
alter table tickets add column if not exists proxima_abordagem text;
alter table tickets add column if not exists urgencia text
  check (urgencia in ('alta', 'media', 'baixa'));
alter table tickets add column if not exists resumo_em timestamptz;
