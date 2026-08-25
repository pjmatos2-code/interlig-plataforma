-- 0035: leads do site (interlig.com) direto no CRM.
-- O formulário "Contratar Online" das LPs é do RD Station Marketing; o RD tem
-- webhook nativo de conversão que envia o lead para a nossa URL. Este passo
-- prepara: nova origem 'site' no ticket + segredo do webhook do RD.
alter type origem_criacao_ticket add value if not exists 'site';

-- permite o sistema 'rdstation' na config de integrações
alter table integracoes_config drop constraint if exists integracoes_config_sistema_check;
alter table integracoes_config
  add constraint integracoes_config_sistema_check
  check (sistema in ('sgp', 'szchat', 'rdstation'));
