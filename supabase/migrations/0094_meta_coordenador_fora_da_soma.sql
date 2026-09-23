-- =====================================================================
-- 0094: meta de coordenador fora da soma geral (23/09/2026).
--
-- A meta do coordenador é a meta DO TIME dele (Marcelo 75 = 3 agentes
-- externos × 25; Aline Santos/BN = a meta da unidade). Somá-la à meta
-- total duplica o time inteiro: o card "Meta do mês" mostrava 370 quando
-- o número real é 265. O marcador identifica quem é coordenador; as
-- somas (dashboard geral, evolução diária, desafio do dia do totem)
-- passam a ignorá-los. Diferente de soma_meta (0067), que é o recorte da
-- META GERENCIAL e continua intocado.
-- =====================================================================

alter table vendedores add column if not exists eh_coordenador boolean not null default false;

update vendedores set eh_coordenador = true where nome in ('Marcelo Otávio', 'Aline Santos');

comment on column vendedores.eh_coordenador is
  'Coordenador de time/unidade: a meta dele é a meta do TIME e não entra na soma da meta geral (0094).';
