-- 0075: origem de criação "sgp_auto" — venda cadastrada direto no SGP vira
-- ticket automaticamente na plataforma (pedido de 01/09).
alter type origem_criacao_ticket add value if not exists 'sgp_auto';
