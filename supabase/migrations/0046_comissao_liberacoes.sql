-- 0046: aprovação manual de venda para comissão.
--
-- A liberação automática (D5/D8) exige contrato ATIVO, assinaturas em dia e
-- CRM consistente. Na virada do mês isso pune a vendedora por um atraso que é
-- operacional: ela vendeu no dia 31, mas a agenda de instalação só abre em
-- setembro. O gestor passa a poder liberar a venda manualmente, com motivo
-- registrado — e revogar depois, se a instalação não se confirmar.
create table if not exists comissao_liberacoes (
  id                     uuid primary key default gen_random_uuid(),
  contrato_id            uuid not null references contratos(id) on delete cascade,
  competencia            date not null,          -- 1º dia do mês de comissão
  motivo                 text not null,
  pendencias_dispensadas text[] not null default '{}',
  aprovado_por           uuid references usuarios(id) on delete set null,
  criado_em              timestamptz not null default now(),
  revogado_em            timestamptz,
  revogado_por           uuid references usuarios(id) on delete set null,
  revogado_motivo        text,
  unique (contrato_id, competencia)
);

create index if not exists idx_comissao_liberacoes_comp
  on comissao_liberacoes (competencia) where revogado_em is null;

alter table comissao_liberacoes enable row level security;

-- só o gestor aprova/revoga
create policy comissao_liberacoes_adm on comissao_liberacoes for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- a vendedora enxerga a liberação do próprio contrato (fica visível no
-- "Minhas vendas" que a gestão liberou aquela venda); supervisor, a da POP
create policy comissao_liberacoes_sel on comissao_liberacoes for select to authenticated
  using (
    exists (
      select 1 from contratos c
      where c.id = comissao_liberacoes.contrato_id
        and app.no_escopo(c.pop_id, c.vendedor_id)
    )
  );

comment on table comissao_liberacoes is
  'Aprovação manual de venda para comissão (adendo 29/08/2026). Uma linha ativa por contrato/competência; revogado_em <> null desfaz sem apagar o histórico.';
