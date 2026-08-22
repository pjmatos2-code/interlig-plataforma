-- 0013: etapa em que a negociação foi encerrada (padrão RD Station)
-- Perdida aparece no kanban na coluna onde parou, com o selo "Perdida";
-- só a vendida vai para a coluna Fechado.
alter table tickets add column if not exists etapa_encerramento etapa_ticket;

update tickets set etapa_encerramento='em_atendimento' where rd_deal_id in ('6a88a9db9801f600259c14d7','6a88a9a335c9a60025c509f2','6a88a12d35f586002457f6dd','6a88a0ea2622120020cd5a1b','6a88a08f9ee193002062a90d','6a85a7dc5b9ee30029180923','6a85a7947064d700248f1de1','6a85a7470b64470020481709','6a84b3030cdc230020c758e9','6a84b2c8323e0200297cc079','6a84b28f3d7a030020d20dbd','6a7dabcf2be0ea002948fb34','6a7dab168d2afd002a04e6dc','6a7daabd692ab7002af06e4f','6a7c712b2b10b1002046dfb3','6a7b55643543b20026077a2b','6a7b5522d0f84f002e2e70ed','6a7b54d5861292002e171651','6a74ea595aa7290033b88f82','6a74e9df23d593002f7b9130','6a74e984e3cc4c0039d1943d','6a724b11251adb002018fb09');
update tickets set etapa_encerramento='novo' where rd_deal_id in ('6a84b341fe556a002634baea');
update tickets set etapa_encerramento='proposta' where rd_deal_id in ('6a7e2489ffbfe60025e0f207');
