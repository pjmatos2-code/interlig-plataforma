-- =====================================================================
-- 0098: escopo GERAL do coordenador de time = só o time (23/09/2026).
--
-- Complemento do 0096 (que valia só para tickets): o Marcelo via a meta
-- e as vendas de Altamira inteira no dashboard. Agora contratos/clientes/
-- títulos/comissões seguem a mesma regra do CRM — coordenador de TIME
-- (coordena vendedoras) vê o time em qualquer cidade; coordenador de
-- UNIDADE vê o POP inteiro.
-- =====================================================================

create or replace function app.no_escopo(p_pop_id uuid, p_vendedor_id uuid)
returns boolean
language sql stable as $$
  select case (select app.perfil())
    when 'gestor' then true
    when 'supervisor' then
      ((select app.coordena_time())
        and p_vendedor_id is not null
        and p_vendedor_id in (select app.vendedores_coordenados()))
      or (not (select app.coordena_time())
        and p_pop_id is not null
        and p_pop_id = (select app.pop_atual()))
    when 'vendedora'          then p_vendedor_id = (select app.vendedor_atual())
    when 'vendedora_externa'  then p_vendedor_id = (select app.vendedor_atual())
    when 'agente_corporativo' then p_vendedor_id = (select app.vendedor_atual())
    else false
  end
$$;

comment on function app.no_escopo(uuid, uuid) is
  'Gestor tudo · supervisor de TIME = vendedoras coordenadas (qualquer POP) · supervisor de UNIDADE = POP inteiro · vendedora só o dela.';
