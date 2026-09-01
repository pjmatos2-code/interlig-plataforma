-- 0068: Equipe Técnica — produtividade e comissionamento por OS do SGP.
--
-- Régua (definição do gestor, 01/09/2026):
--   ATM: R$ 30 por Instalação de equipamento e Mudança de Endereço
--   BN e VTX: R$ 15 pelos mesmos motivos
--   Suporte (só quem tem recebe_suporte): R$ 10 por OS de suporte
--   Só OS ENCERRADA pontua; retorno em <24h anula a OS de origem.
create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null check (unidade in ('atm', 'bn', 'vtx')),
  recebe_suporte boolean not null default false,
  ativo boolean not null default true,
  foto_url text
);

create table if not exists os_tecnicas (
  id uuid primary key default gen_random_uuid(),
  sgp_os_id text not null unique,
  sgp_contrato_id text,
  cliente_nome text,
  pop text,
  bairro text,
  tipo text,
  motivo text,
  status text,
  criada_em timestamptz,
  agendamento timestamptz,
  checkin timestamptz,
  encerrada_em timestamptz,
  responsavel text,
  auxiliares text,
  finalizado_por text,
  servico_prestado text,
  importado_em timestamptz not null default now()
);
create index if not exists os_tecnicas_encerrada_idx on os_tecnicas (encerrada_em);
create index if not exists os_tecnicas_contrato_idx on os_tecnicas (sgp_contrato_id);

alter table tecnicos enable row level security;
alter table os_tecnicas enable row level security;
drop policy if exists tecnicos_sel on tecnicos;
create policy tecnicos_sel on tecnicos for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro());
drop policy if exists os_tecnicas_sel on os_tecnicas;
create policy os_tecnicas_sel on os_tecnicas for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro());

insert into tecnicos (nome, unidade, recebe_suporte) values
  ('Adriano Silva', 'atm', true),
  ('Adriano Oliveira', 'atm', false),
  ('Cleyson Castro', 'atm', true),
  ('Edinaldo Nunes', 'atm', true),
  ('Lucas Goes', 'atm', false),
  ('Laercio Gadelha', 'atm', false),
  ('Hitalo Adrison', 'atm', false),
  ('Raygleison Luciano', 'atm', false),
  ('Fabricio Soares', 'bn', false),
  ('Jonas Freitas', 'bn', false),
  ('Welison Costa', 'vtx', false),
  ('Milton Aparecido', 'vtx', false)
on conflict (nome) do nothing;
