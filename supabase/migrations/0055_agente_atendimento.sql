-- 0055: perfil e setor do Atendimento.
--
-- Talia e Myllena não vendem: refidelizam. Se entrassem como "vendedora
-- interna" apareceriam no ranking e no painel de vendedoras com zero vendas,
-- receberiam tickets do CRM e poluiriam o cálculo comercial. O setor separa as
-- duas coisas na origem, em vez de cada tela ter de lembrar de excluí-las.
alter type perfil_usuario add value if not exists 'agente_atendimento';

alter table vendedores
  add column if not exists setor text not null default 'comercial'
    check (setor in ('comercial', 'atendimento'));

comment on column vendedores.setor is
  'comercial = vende (ranking, metas, comissão de venda); atendimento = refidelização (aditivos).';

update vendedores set setor = 'atendimento'
where lower(sgp_login) in ('talia.marques', 'myllena.araujo');
