-- 0022: novo perfil "vendedora_externa" (PAP). Comporta-se como vendedora nos
-- dados (vê só o que é dela); a diferença é o acesso ao módulo Venda Externa.
alter type perfil_usuario add value if not exists 'vendedora_externa';
