-- 0079: o protocolo do SZ vale como identificação mínima do ticket.
--
-- O ticket nascido na TRANSFERÊNCIA da conversa (webhook do fluxo) chega com
-- nome + protocolo + equipe — o telefone só resolve depois, quando o robô
-- encontra a conversa na listagem e completa (match por protocolo). A regra
-- antiga (telefone OU cpf) rejeitava exatamente esses tickets.

alter table tickets drop constraint if exists ticket_identificacao_minima;
alter table tickets add constraint ticket_identificacao_minima
  check (
    coalesce(cpf, '') <> ''
    or coalesce(telefone, '') <> ''
    or coalesce(sz_conversa_id, '') <> ''
  );
