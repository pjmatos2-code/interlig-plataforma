-- 0038: Setor Corporativo — mesmo fluxo da Venda Externa (visita -> ticket),
-- para o agente de planos corporativos. Clientes PJ levam mais tempo para
-- converter e as tratativas ficam registradas no ticket.
alter table visitas_externas add column if not exists setor text not null default 'pap'
  check (setor in ('pap', 'corporativo'));
create index if not exists visitas_externas_setor_idx on visitas_externas (setor, criado_em desc);

-- planos oferecidos no formulário do corporativo (gestor marca no Admin;
-- nenhum marcado = mostra todos, mesmo fallback da venda externa)
alter table planos add column if not exists setor_corporativo boolean not null default false;
