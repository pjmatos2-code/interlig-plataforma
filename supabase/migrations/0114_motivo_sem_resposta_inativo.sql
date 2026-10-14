-- 0114: "Sem resposta" sai da lista de motivos do CRM (gestor, 14/10/2026) —
-- era o motivo mais usado e não dizia nada; "Outro" já estava desativado.
-- Desativar (e não apagar) preserva o histórico dos tickets já fechados e o
-- fechamento AUTOMÁTICO por inatividade, que procura o motivo pelo nome.
update public.motivos_nao_conversao set ativo = false where nome in ('Sem resposta', 'Outro');
