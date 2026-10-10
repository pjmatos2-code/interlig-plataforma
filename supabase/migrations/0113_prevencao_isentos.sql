-- 0113: contratos isentos fora da prevenção (controle interno, cortesia,
-- mensalidade zero) — mesma regra da Fidelidade da base. Um contrato de
-- CONTROLE INTERNO liderava a fila de insatisfação.
create or replace function public.prevencao_base()
returns table (
  contrato_id uuid, sgp_contrato_id text, status text, sgp_cliente_id text, cliente text,
  telefone text, plano text, pop text, valor numeric, ativacao date, corporativo boolean
)
language sql stable as $$
  select c.id, c.sgp_contrato_id, c.status::text, cl.sgp_cliente_id, cl.nome, cl.telefone,
         p.nome, po.nome, c.valor_mensalidade, coalesce(c.data_ativacao, c.data_venda),
         length(regexp_replace(coalesce(cl.cpf, ''), '\D', '', 'g')) = 14
           or coalesce(p.nome, '') ~* 'CORPORATE|\mPJ\M|DEDICADO|EMPRESARIAL|COMERCIAL'
  from contratos c
  join clientes cl on cl.id = c.cliente_id
  left join planos p on p.id = c.plano_id
  left join pops po on po.id = c.pop_id
  where c.status in ('ativo', 'suspenso')
    and coalesce(p.nome, '') !~* 'rede neutra|permuta'
    -- isentos: controle interno, cortesia, mensalidade zero ("PLAY ISENTO" é
    -- o SVA que acompanha a internet, não torna o contrato isento)
    and c.valor_mensalidade > 0
    and replace(upper(coalesce(p.nome, '')), 'PLAY ISENTO', '') !~ 'ISENT|CORTESIA|CONTROLE INTERNO'
    and cl.nome !~* 'PERMUTA|PREFEITURA|FUNDO MUNICIPAL|SECRETARIA|MUNIC[IÍ]PIO|C[AÂ]MARA MUNICIPAL|SEMED|SESPA|CENTRO REGIONAL DE SA[UÚ]DE|GOVERNO|ESTADO DO PAR|FUNDA[CÇ][AÃ]O NACIONAL|FUNDA[CÇ][AÃ]O INSTITUTO BRASILEIRO|AG[EÊ]NCIA BRASILEIRA|CONSELHO ESCOLAR|CONS[OÓ]RCIO POLICL|POL[IÍ]CIA MILITAR|MINIST[EÉ]RIO P[UÚ]BLICO|TRIBUNAL|DEFENSORIA|INSTITUTO FEDERAL|UNIVERSIDADE FEDERAL'
$$;
notify pgrst, 'reload schema';
