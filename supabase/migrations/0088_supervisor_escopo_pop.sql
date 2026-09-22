-- =====================================================================
-- 0088: coordenador de unidade enxerga o POP inteiro (21/09/2026).
--
-- Pedido do gestor: Railson (Vitória do Xingu) e Aline Moraes (Brasil
-- Novo) devem ver TODAS as movimentações do próprio POP — dashboard,
-- CRM, esteira, qualidade — independente de quem fez a venda.
--
-- O escopo antigo do supervisor era só "vendedoras sob coordenação"
-- (vendedores.coordenador_id), pensado para o Marcelo na venda externa,
-- cujo time cruza cidades. Um coordenador de unidade recém-criado não
-- coordena ninguém e ficava com tudo zerado.
--
-- Novo escopo do supervisor = UNIÃO dos dois mundos:
--   • tudo que pertence ao POP do usuário (usuarios.pop_id); e
--   • as vendedoras que ele coordena, em qualquer POP (Marcelo continua
--     vendo o time externo inteiro).
-- =====================================================================

create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid)
returns boolean
language sql stable as $$
  select case
    when app.perfil() = 'gestor'     then true
    when app.perfil() = 'supervisor' then
      (p_pop_id is not null and p_pop_id = app.pop_atual())
      or (p_vendedor_id is not null and app.agente_sob_coord(p_vendedor_id))
    when app.perfil() in ('vendedora','vendedora_externa','agente_corporativo')
      then p_vendedor_id = app.vendedor_atual()
    else false
  end
$$;

comment on function app.no_escopo(uuid, uuid) is
  'Escopo de leitura: gestor tudo; supervisor = POP dele ∪ vendedoras coordenadas; vendedora só o dela.';

-- o coordenador também OPERA o CRM da unidade (reatribuir, fechar, editar)
drop policy if exists tickets_upd on tickets;
create policy tickets_upd on tickets for update to authenticated using (
  app.eh_gestor()
  or (app.eh_supervisor() and (
    pop_id = app.pop_atual()
    or app.agente_sob_coord(vendedor_id)
    or app.ticket_eh_venda_externa(id)
  ))
  or (app.eh_vendedora() and vendedor_id = app.vendedor_atual())
);
