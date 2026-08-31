-- 0064: irreversível precisa da aprovação do Administrador.
--
-- Regra da gestão (31/08): a agente PROPÕE o irreversível; quem confirma é o
-- gestor, depois de analisar a conversa ou as evidências (mudança real para
-- local sem cobertura, outro estado...). Enquanto pendente, o caso CONTA no
-- denominador da taxa — sair da conta é privilégio de irreversível aprovado.
-- Isso fecha a última porta da "lixeira": marcar irreversível sem evidência
-- não melhora a taxa de ninguém.
alter table casos_retencao
  add column if not exists irreversivel_status text
    check (irreversivel_status in ('pendente', 'aprovado', 'rejeitado')),
  add column if not exists irreversivel_decidido_por uuid references usuarios(id) on delete set null,
  add column if not exists irreversivel_decidido_em timestamptz;

-- histórico: junho/julho são meses já avaliados e pagos por fora — entram
-- aprovados. AGOSTO fica PENDENTE: o gestor valida antes de fechar o mês.
update casos_retencao set irreversivel_status = 'aprovado'
where desfecho = 'irreversivel' and origem = 'importado_rd'
  and criado_em < '2026-08-01';

update casos_retencao set irreversivel_status = 'pendente'
where desfecho = 'irreversivel' and irreversivel_status is null;

-- limpeza: o RD marcava "Nada" como motivo dos casos ganhos — não é motivo
update casos_retencao set motivo_declarado = null where motivo_declarado = 'Nada';
