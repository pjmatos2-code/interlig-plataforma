-- 0021: habilita Comercial Vitória do Xingu no gate do webhook (D1)
insert into sz_equipes_habilitadas (nome, pop_id, ativo)
select 'Comercial Vitória do Xingu', p.id, true
from pops p where p.nome = 'Vitória do Xingu'
  and not exists (select 1 from sz_equipes_habilitadas e where e.nome ilike 'Comercial Vit%Xingu');
