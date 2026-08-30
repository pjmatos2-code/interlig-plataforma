-- 0058: setores com a granularidade que a gestão usa no dia a dia.
--
-- 'comercial' juntava interno e externo, que têm régua, meta e rotina
-- diferentes — e o painel por vendedora precisa filtrar por eles. Passa a
-- valer o mesmo vocabulário da gestão: comercial interno, comercial externo,
-- refidelização (Atendimento) e setor corporativo.
--
-- A ordem importa: solta a restrição antiga, migra os dados e só então aplica
-- a nova — senão as linhas em 'comercial' barram a própria migração.
alter table vendedores drop constraint if exists vendedores_setor_check;

-- classificação inicial pelo perfil de quem opera o cadastro
update vendedores v set setor = 'comercial_externo'
where exists (
  select 1 from usuarios u where u.vendedor_id = v.id and u.perfil = 'vendedora_externa'
);

update vendedores v set setor = 'corporativo'
where exists (
  select 1 from usuarios u where u.vendedor_id = v.id and u.perfil = 'agente_corporativo'
);

-- Marcelo Otávio coordena a venda externa
update vendedores set setor = 'comercial_externo' where nome = 'Marcelo Otávio';

-- o que sobrou em 'comercial' é interno
update vendedores set setor = 'comercial_interno' where setor = 'comercial';

alter table vendedores alter column setor set default 'comercial_interno';
alter table vendedores add constraint vendedores_setor_check
  check (setor in ('comercial_interno', 'comercial_externo', 'atendimento', 'corporativo'));

comment on column vendedores.setor is
  'comercial_interno | comercial_externo | atendimento (refidelização) | corporativo. Define régua de comissão, ranking e filtro do painel.';
