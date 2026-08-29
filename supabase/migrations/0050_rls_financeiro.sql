-- 0050: RLS do perfil financeiro (somente leitura do que é pagamento).
-- Precisa ser um arquivo separado do 0049: o Postgres não deixa usar um valor
-- novo do enum na mesma transação em que ele foi criado.

create or replace function app.eh_financeiro() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from usuarios u where u.id = auth.uid() and u.perfil = 'financeiro' and u.ativo) $$;

-- comissões fechadas: gestor administra; financeiro lê tudo e marca pagamento;
-- a agente lê a própria (é o demonstrativo dela)
drop policy if exists comissoes_fechadas_sel on comissoes_fechadas;
create policy comissoes_fechadas_sel on comissoes_fechadas for select to authenticated
  using (
    app.eh_gestor()
    or app.eh_financeiro()
    or vendedor_id = (select u.vendedor_id from usuarios u where u.id = auth.uid())
  );

drop policy if exists comissoes_fechadas_adm on comissoes_fechadas;
create policy comissoes_fechadas_adm on comissoes_fechadas for all to authenticated
  using (app.eh_gestor()) with check (app.eh_gestor());

-- o financeiro não altera valores: só registra que pagou. A coluna é protegida
-- por trigger porque o RLS sozinho não distingue quais campos mudaram.
drop policy if exists comissoes_fechadas_pagamento on comissoes_fechadas;
create policy comissoes_fechadas_pagamento on comissoes_fechadas for update to authenticated
  using (app.eh_financeiro()) with check (app.eh_financeiro());

create or replace function app.financeiro_so_marca_pagamento() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if app.eh_gestor() then return new; end if;
  if app.eh_financeiro() then
    -- tudo que não é pagamento tem de continuar igual
    if new.vendedor_id is distinct from old.vendedor_id
       or new.mes_ano is distinct from old.mes_ano
       or new.snapshot is distinct from old.snapshot
       or new.valor_total is distinct from old.valor_total
       or new.versao is distinct from old.versao
       or new.fechado_em is distinct from old.fechado_em then
      raise exception 'Financeiro só pode registrar o pagamento, não alterar a apuração.';
    end if;
    return new;
  end if;
  raise exception 'Sem permissão para alterar comissões fechadas.';
end $$;

drop trigger if exists trg_financeiro_pagamento on comissoes_fechadas;
create trigger trg_financeiro_pagamento before update on comissoes_fechadas
  for each row execute function app.financeiro_so_marca_pagamento();

-- histórico: gestor e financeiro leem; ninguém edita pela aplicação
drop policy if exists comissoes_hist_sel on comissoes_fechadas_historico;
create policy comissoes_hist_sel on comissoes_fechadas_historico for select to authenticated
  using (app.eh_gestor() or app.eh_financeiro());

-- leitura de apoio para o financeiro montar o demonstrativo
drop policy if exists vendedores_sel_fin on vendedores;
create policy vendedores_sel_fin on vendedores for select to authenticated
  using (app.eh_financeiro());

drop policy if exists comissao_comp_cfg_sel_fin on comissao_competencia_config;
create policy comissao_comp_cfg_sel_fin on comissao_competencia_config for select to authenticated
  using (true);
