# GRR, Etapa 4: reunião de resultados

Situação: desenvolvida na branch `feat/grr-etapa-4`. Depende da migração `0137_grr_reuniao_diretoria.sql`.

## Funcionamento

- `/grr/reunioes`: a diretoria cria a reunião de resultados (empresa ou unidade, data e semana de referência; por padrão a última semana completa). Sem agenda fixa.
- `/grr/reunioes/[id]`:
  - preparação: semana congelada ou não, desvios sem diagnóstico e planos aguardando a diretoria;
  - participantes (diretoria e coordenação, mais convidados por nome);
  - pauta fixa, na ordem da especificação: (1) indicadores, metas e resultados; (2) diagnósticos dos desvios; (3) acompanhamento das ações anteriores; (4) proposição e aprovação de novas ações (com aprovação dos planos na própria pauta); (5) decisões e encerramento. Cada item aceita anotações;
  - decisões com responsável e prazo;
  - encerramento.
- Modo Apresentação ligado à reunião (`/apresentacao/grr?reuniao=<id>`): semana e abrangência da reunião, participantes na abertura, decisões e encerramento na última seção.
- Resumo executivo: o cartão "Próxima reunião" mostra a reunião aberta registrada no GRR (ou avisa que não há reunião programada).

## Encerramento e histórico

Só a diretoria encerra (conferido na ação e no banco). Ao encerrar: a semana é congelada, se ainda não estiver; a reunião guarda os números, os diagnósticos, os planos, os participantes e a ata; os participantes recebem aviso no sino. Planos decididos durante a reunião ficam ligados a ela. Depois do encerramento, nada muda: correções entram como registro à parte e saem também no PDF.

## Relatório

Na plataforma (a página da reunião encerrada) e em PDF (`/api/grr/reunioes/[id]/pdf`). O PDF usa o mesmo mecanismo do Relatório da diretoria: o servidor imprime a página `/reuniao-pdf/[id]` com link assinado que expira em minutos; sem a assinatura, a página não abre. Só para reunião encerrada.

O Relatório Semanal da Diretoria continua funcionando como antes; a apresentação da semana sem reunião registrada segue usando os campos de reunião do relatório.

## Banco (migração 0137)

Coluna `ata` em `grr.reunioes` e a regra de encerramento só pela diretoria no gatilho da tabela. Ensaio com transação desfeita: 10 conferências.

## Permissões

Direção e administração criam, conduzem e encerram. A coordenação participa e prepara pelos diagnósticos e planos do próprio recorte; não abre a reunião da empresa.
