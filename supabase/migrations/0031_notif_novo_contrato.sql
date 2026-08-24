-- =====================================================================
-- 0031: "nova venda" passa a ser NOVO CONTRATO detectado no SGP.
-- Fluxo do gestor: o sync cria o contrato -> Administrador é notificado ->
-- ele verifica a venda, identifica a vendedora no SGP e atribui.
-- Como contrato novo vem sem vendedor, a notificação vai só para o gestor
-- (notificar com vendedor NULL = apenas gestores). Dispara em AFTER INSERT,
-- que com o upsert (onConflict sgp_contrato_id) só ocorre para contrato NOVO.
-- =====================================================================

-- remove os gatilhos de atribuição (modelo anterior)
drop trigger if exists contratos_notifica_ins on contratos;
drop trigger if exists contratos_notifica_upd on contratos;
drop function if exists app.notif_nova_venda();

create or replace function app.notif_novo_contrato() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cli text; pl text;
begin
  select nome into cli from clientes where id = new.cliente_id;
  select nome into pl  from planos   where id = new.plano_id;
  perform app.notificar(
    'novo_contrato', null,
    '🆕 Novo contrato no SGP',
    coalesce(cli, 'Cliente') || coalesce(' · ' || pl, '') || ' · verifique e atribua a vendedora',
    '/vendedoras/atribuir'
  );
  return new;
end $$;

drop trigger if exists contratos_notifica_novo on contratos;
create trigger contratos_notifica_novo after insert on contratos
  for each row execute function app.notif_novo_contrato();
