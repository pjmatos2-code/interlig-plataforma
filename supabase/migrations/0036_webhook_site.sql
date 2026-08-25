-- 0036: o site integra DIRETO com a plataforma (decisão 25/08: substituir o
-- RD Station). A config do webhook passa de 'rdstation' para 'site'.
alter table integracoes_config drop constraint if exists integracoes_config_sistema_check;
update integracoes_config set sistema = 'site' where sistema = 'rdstation';
alter table integracoes_config
  add constraint integracoes_config_sistema_check
  check (sistema in ('sgp', 'szchat', 'site'));
