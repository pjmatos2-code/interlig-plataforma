-- 0109: cancelamentos lidos do relatório "Contratos Cancelados" do SGP
-- (10/10/2026). A API da URA não traz a data de cancelamento: o sync gravava a
-- data da venda e setembro/outubro ficaram com quase nenhum cancelamento no
-- mês certo. O relatório é a fonte oficial da data, do motivo e da situação do
-- contrato ANTES de cancelar (Ativo = pediu para sair; Suspenso = débito;
-- Inativo/Novo = nem chegou a instalar).
create table if not exists public.cancelamentos_sgp (
  sgp_contrato_id text not null,
  data_cancelamento date not null,
  motivo text,
  usuario text,
  status_anterior text,
  cliente text,
  lido_em timestamptz not null default now(),
  primary key (sgp_contrato_id, data_cancelamento)
);
create index if not exists cancelamentos_sgp_data_idx on public.cancelamentos_sgp (data_cancelamento);
alter table public.cancelamentos_sgp enable row level security;
-- sem policy: traz nome e CPF do cliente — só o servidor (service role) lê
notify pgrst, 'reload schema';
