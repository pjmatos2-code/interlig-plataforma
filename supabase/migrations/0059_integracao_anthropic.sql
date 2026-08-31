-- 0059: registra 'anthropic' como sistema de integração válido.
--
-- O analista de conversas do módulo Retenção usa a API da Anthropic para ler
-- transcripts e extrair motivo, oferta e desfecho. A chave fica em
-- integracoes_config como as demais credenciais — mas o CHECK da tabela só
-- conhecia os sistemas originais e barrou a gravação.
alter table integracoes_config drop constraint if exists integracoes_config_sistema_check;
alter table integracoes_config add constraint integracoes_config_sistema_check
  check (sistema in ('sgp', 'szchat', 'site', 'anthropic'));
