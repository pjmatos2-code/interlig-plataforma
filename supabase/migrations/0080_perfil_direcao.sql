-- 0080: perfil "direcao" — visualiza todos os módulos (exceto Administração),
-- não aprova nem edita nada. O valor do enum precisa commitar antes do uso
-- (aplicado em statement próprio pelo script).
alter type perfil_usuario add value if not exists 'direcao';
