-- 0017: regra novata (Instrução AGO/2026) — Maclicya em rampa de 90 dias não
-- carrega meta (como Amanda). Meta do mês passa a ser a soma das metas das
-- vendedoras ativas: interno 70×2 + externo 25×5 = 265.
delete from metas m
using vendedores v
where m.escopo = 'vendedora'
  and m.referencia_id = v.id
  and v.nome = 'Maclicya Martins'
  and m.mes_ano = date '2026-08-01';
