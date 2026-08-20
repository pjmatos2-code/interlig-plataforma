# Amostras do SGP (fixtures do modo mock)

Formato NORMALIZADO (lib/sgp/tipos.ts) que o `SgpMockClient` devolve — o mesmo
que o `SgpApiClient` devolverá depois do mapeamento da Fase 0. Dados fictícios.

Quando as credenciais reais existirem, o `scripts/sgp-discovery.mjs` salva aqui
as respostas CRUAS mascaradas da instância da Interlig (arquivos `raw-*.json`)
para fechar o mapeamento campo-a-campo dentro do SgpApiClient.
