-- 0070: pseudo-agente da Gestão Comercial — recebe o override no fechamento.
-- ativo=false para não aparecer em ranking/painéis operacionais; o financeiro
-- o vê pelas comissoes_fechadas.
alter table vendedores drop constraint if exists vendedores_setor_check;
alter table vendedores add constraint vendedores_setor_check
  check (setor = any (array['comercial_interno','comercial_externo','atendimento','corporativo','retencao','gerencia']));

insert into vendedores (nome, setor, ativo, soma_meta)
select 'Gestão Comercial', 'gerencia', false, false
where not exists (select 1 from vendedores where nome = 'Gestão Comercial');
