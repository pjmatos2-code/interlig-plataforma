-- 0086: gravação ATÔMICA de chaves em integracoes_config.
--
-- Durante a suspensão da Vercel (18/09), um ciclo gravou a config do szchat
-- a partir de uma leitura vazia (read-spread-upsert em corrida) e apagou as
-- credenciais do robô. Este merge em SQL (config || patch) elimina a janela:
-- nenhuma chave existente é perdida, mesmo com leituras falhas/concorrentes.
create or replace function app.mesclar_config(p_sistema text, p_patch jsonb)
returns void language sql security definer set search_path = public as $$
  insert into integracoes_config (sistema, config, atualizado_em)
  values (p_sistema, p_patch, now())
  on conflict (sistema) do update
    set config = integracoes_config.config || excluded.config,
        atualizado_em = now();
$$;
