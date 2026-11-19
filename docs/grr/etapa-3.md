# GRR, Etapa 3: diagnósticos e planos de ação

Situação: desenvolvida na branch `feat/grr-etapa-3`. Depende da migração `0136_grr_diagnosticos_e_acoes.sql`.

## Diagnóstico dos desvios

Na tela de cada grupo (`/grr/[grupo]`), para os indicadores em atenção ou crítico no recorte da tela, a coordenação registra: causa identificada, evidências, providências já tomadas e solução proposta. Ligado ao indicador, à semana e ao recorte. Cada salvamento é uma versão nova (autor, data e versões anteriores ficam guardados). Os números do indicador no momento do diagnóstico são recalculados no servidor e guardados junto. Sem evidência, a tela mostra a causa como hipótese.

## Planos de ação

`/grr/planos` e `/grr/planos/[id]`. Uma ou mais ações por indicador (ou por um problema descrito), com resultado esperado, responsável principal, prazo, evidências e histórico. Propostos pela tela do indicador (já ligados ao diagnóstico) ou pela lista.

- Aprovação (separada da execução): aguardando a diretoria, aprovado, ajuste pedido, rejeitado. Ajuste e rejeição exigem justificativa. Depois de um ajuste, o recorte corrige e reenvia.
- Situação: pendente, em andamento, aguardando validação, concluída, cancelada. "Atrasada" é calculada pelo prazo. A coordenação leva até "aguardando validação"; validar e concluir é da diretoria.
- Histórico automático de cada mudança (situação, aprovação, ação, resultado esperado, responsável e prazo), evidências e comentários.
- Fila "Aguardando a sua decisão" para a diretoria, com os planos e os compromissos gerenciais das reuniões de equipe.

## Avisos no sino

Na tabela de notificações já existente: plano proposto ou reenviado (diretoria), decisão da diretoria (quem propôs e o responsável), aguardando validação (diretoria), concluído (quem propôs e o responsável), prazo vencendo amanhã ou atrasado (uma vez por dia, junto com os lembretes do CRM).

## Onde mais aparece

- Resumo executivo: planos por situação na coluna de gestão; na próxima reunião, planos aguardando a diretoria e desvios sem diagnóstico.
- Modo Apresentação da diretoria: diagnósticos em cada desvio; planos aguardando decisão (com aprovação na própria tela) e acompanhamento dos planos em execução.

## Permissões

Direção e administração: todos os recortes, aprovação e validação. Coordenação: a própria equipe e os agentes dela (ou, sem equipe, a unidade e os agentes da unidade). Agentes: sem acesso ao GRR.

## Banco (migração 0136)

`grr.diagnosticos` (só inclusão), `grr.acoes`, `grr.acao_eventos` (só inclusão), função `grr.no_escopo` e visões `public.grr_*`. Nenhuma tabela existente muda. Ensaio com transação desfeita: 25 conferências.

## Fora desta etapa

Rotinas das lideranças (a definir); relatório da reunião em PDF próprio do GRR (Etapa 4); churn precoce (Etapa 5).
