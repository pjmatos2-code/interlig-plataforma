-- =====================================================================
-- 0011: ordens de instalação do SGP (Operacional / Instalação de equipamento)
-- A API só expõe OS ABERTA; quando entra em execução/finaliza, some da
-- listagem — marcamos situacao='saiu_da_fila'. O responsável atribuído é o
-- start dos contratos prontos para o operacional (José Galdino / Aline
-- Santos; Railson Costa em Vitória do Xingu).
-- =====================================================================
create table if not exists os_instalacao (
  sgp_os_id       text primary key,
  contrato_id     uuid references contratos(id) on delete cascade,
  sgp_contrato_id text not null,
  protocolo       text,
  motivo          text,
  setor           text,
  responsavel     text,                -- os_tecnico_responsavel (vazio = sem responsável)
  agendamento     timestamptz,         -- os_data_agendamento (null = ainda não agendada)
  os_cadastrada_em timestamptz,
  situacao        text not null default 'aberta' check (situacao in ('aberta','saiu_da_fila')),
  visto_em        timestamptz not null default now()
);
create index if not exists os_instalacao_contrato_idx on os_instalacao (contrato_id) where situacao='aberta';

alter table os_instalacao enable row level security;
drop policy if exists os_inst_sel on os_instalacao;
create policy os_inst_sel on os_instalacao for select to authenticated using (true);

-- cursor de verificação por contrato (para varrer poucos por sync)
alter table contratos add column if not exists os_verificado_em timestamptz;
