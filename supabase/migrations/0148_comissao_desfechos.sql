-- 0148: desfecho "não comissiona" na fila de aprovação do fechamento (27/11/2026).
--
-- A fila "Aguardando decisão" só tinha Aprovar. Venda que não vai ser
-- liberada (suspensa depois do evento, venda que não vale) ficava lá para
-- sempre. O gestor passa a encerrar a linha com um desfecho e motivo: ela sai
-- da fila e vai para "Encerradas sem comissão", com Desfazer.
--
-- Tabela PRÓPRIA, não uma coluna em comissao_liberacoes: quem lê as
-- liberações (painel por vendedora, regra de liberação) trata toda linha
-- ativa como venda liberada — um "recusada" ali viraria comissão por engano.
-- Esta tabela não libera nada; só organiza a fila. A desistência antes da
-- ativação continua nas colunas de contratos (0066), como na Esteira.
create table if not exists comissao_desfechos (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid not null references contratos(id) on delete cascade,
  competencia   date not null,              -- 1º dia do mês de comissão
  motivo        text not null,
  definido_por  uuid references usuarios(id) on delete set null,
  definido_em   timestamptz not null default now(),
  desfeito_em   timestamptz,
  desfeito_por  uuid references usuarios(id) on delete set null,
  unique (contrato_id, competencia)
);

create index if not exists idx_comissao_desfechos_comp
  on comissao_desfechos (competencia) where desfeito_em is null;

alter table comissao_desfechos enable row level security;

-- só o gestor decide; a direção acompanha (mesma régua de comissao_liberacoes)
drop policy if exists comissao_desfechos_adm on comissao_desfechos;
create policy comissao_desfechos_adm on comissao_desfechos for all to authenticated
  using ((select app.eh_gestor())) with check ((select app.eh_gestor()));
drop policy if exists comissao_desfechos_sel_direcao on comissao_desfechos;
create policy comissao_desfechos_sel_direcao on comissao_desfechos for select to authenticated
  using ((select app.eh_direcao()));

comment on table comissao_desfechos is
  'Desfecho "não comissiona" da fila de aprovação (27/11/2026). Não libera nada: só tira a venda da fila. desfeito_em <> null devolve à fila sem apagar o histórico.';
