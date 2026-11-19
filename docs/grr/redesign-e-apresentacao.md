# GRR: novo Resumo executivo e Modo Apresentação

Situação: desenvolvido na branch `feat/grr-redesign`. Sem migração de banco e sem mudança de regra de cálculo.

## Resumo executivo (`/grr`)

- Cabeçalho executivo: título, recorte, cartão do período (semana com setas, atalhos para a semana atual e a última completa), botão **Apresentar** e o PDF do Relatório da diretoria da semana, quando existe (direção e administração).
- Abas: Resumo executivo, Histórico, Configuração (só administração) e as áreas futuras marcadas com a etapa.
- Filtros de unidade, equipe e agente com as mesmas regras de recorte; a coordenação vê o recorte travado.
- Quatro destaques: vendas da semana, ativações, conversão do CRM e receita nova. O anel de atingimento só aparece com meta válida em indicador em que maior é melhor; sem meta, o cartão mostra "Sem meta".
- Evolução das vendas (8 semanas) com a meta da semana analisada como traço, e a situação dos indicadores em rosca (na meta, atenção, crítico e sem meta; sem meta nunca conta como bom).
- Tabela com os oito grupos do GRR Comercial, cada métrica em linha própria; inadimplência e churn aparecem como "previsto na Etapa 5".
- Coluna de gestão: próxima reunião (do Relatório da diretoria), principais alertas (indicadores críticos e em atenção) e o combinado da reunião anterior com a conferência (Feito, Parcial, Não feito).

As contas de apresentação ficam em `lib/grr/painel.ts`; nenhuma regra de indicador foi duplicada.

## Modo Apresentação (`/apresentacao/grr`)

Fora do menu da plataforma, com login e perfil conferidos no servidor. Usa a semana e o recorte escolhidos no painel e a foto congelada quando existe.

Oito seções: abertura, resumo executivo, vendas e ativações, leads e conversão, receita e qualidade da venda, diagnóstico dos desvios, planos de ação e encerramento. Navegação por botões, setas, Page Up/Down, espaço, Home/End, sumário de seções, tela cheia (botão ou F) e retorno ao GRR com os mesmos filtros. A seção atual fica no endereço (`#vendas`). O detalhamento por agente abre por cima, sem sair da apresentação. A lista de tickets (nomes de clientes) não vai para a apresentação.

O registro da reunião usa o que já existe no Relatório da diretoria (`relatorios_semanais.reuniao`), pelos mesmos campos e pela mesma ação: data, participantes, entregue contra a meta, motivo real do desvio, conferência do combinado anterior e as ações combinadas. Só direção e administração gravam.

Encerramento: direção e administração congelam a semana completa com origem "reunião". Se a semana já tem foto, nada muda; correções seguem criando nova versão com motivo.

## Depende das próximas etapas

- Etapa 3: diagnóstico da coordenação por indicador; planos de ação com situação durante a semana, evidências e aprovação pela diretoria.
- Etapa 4: agenda de reuniões (data programada, preparação, reunião de sábado e de segunda).
- Etapa 5: inadimplência da primeira fatura, clientes suspensos das safras e churn precoce.
- Mix de planos: ainda não calculado no GRR.
