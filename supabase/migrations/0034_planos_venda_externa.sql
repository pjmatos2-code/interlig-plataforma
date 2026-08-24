-- 0034: seleção de planos da Venda Externa (PAP).
-- O PAP vende só os planos residenciais; o gestor marca no Administração quais
-- planos aparecem no formulário de visita. Nenhum marcado = mostra todos
-- (fallback para o módulo nunca ficar sem opção).
alter table planos add column if not exists venda_externa boolean not null default false;
