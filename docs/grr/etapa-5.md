# GRR, Etapa 5: validação

Situação: desenvolvida na branch `feat/grr-etapa-5`. Sem migração. Inadimplência e churn precoce ficaram fora do GRR por decisão da gestão (19/11/2026).

## Conferência dos dados (`/grr/conferencia`)

Para a diretoria, por semana, no recorte da empresa e com os números de agora. Só leitura. Verifica:

- **Somas e taxas**: vendas por agente e por unidade, tickets fechados e convertidos por agente batem com os totais; nenhum agente com mais convertidos que atendidos ou que fechados. A soma da conversão por safra por agente pode passar do total quando um lead passou por mais de um agente (aparece com cada um).
- **Leads e atribuição**: leads da semana sem atendimento, abertos hoje sem atendimento, tickets repetidos do mesmo lead, leads que mudaram de agente (e quantos viraram venda com agente diferente do primeiro, pelo histórico de reatribuição do ticket), fechados fora da conversão.
- **Vendas e reconciliação com o SGP**: vendas sem agente (não atribuídas automaticamente), vendas lançadas direto no SGP sem atendimento no CRM, tickets convertidos sem contrato ligado, datas de ativação iguais às da venda.
- **Outras fontes**: vendas do GRR contra o Relatório da diretoria da semana e números de agora contra a semana congelada.

Abaixo, leads e conversão por agente (recebidos, atendidos, as duas conversões e vendas), com marcação de número impossível.

As contas ficam em `lib/grr/conferencia.ts` (puras, testadas); nenhuma regra de indicador foi recalculada.

## Permissões por perfil

`scripts/grr/conferir-permissoes.mjs` confere, numa transação desfeita no final, todas as visões do GRR: sem login nada; administração e direção tudo; coordenação só a própria equipe e os agentes dela (ou a unidade, para quem não coordena equipe; quem apoia uma equipe conta como coordenação com equipe, como no banco); agente nada. Também confirma que a coordenação não congela semana, não cria meta e não aprova plano, que a direção não cria meta e que o agente não registra diagnóstico. Não imprime dado de ninguém.

    node --env-file=.env.local scripts/grr/conferir-permissoes.mjs

## Regras

Testes automatizados de todas as regras do GRR (escopo, semana, metas e faixas, fotos, safra, painel, reuniões, planos, recortes e conferência).
