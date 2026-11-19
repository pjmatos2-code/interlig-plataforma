# GRR: rotinas das lideranças

Situação: desenvolvida na branch `feat/grr-rotinas`. Sem migração: tudo é calculado a partir dos dados que já existem (tickets do CRM, diagnósticos, reuniões, planos e o histórico de cada um). Ninguém marca nada.

## O roteiro (decidido pela gestão em 19/11/2026)

Coordenação, toda semana:

1. Todo dia: os leads do dia atendidos no mesmo dia (primeira tratativa no dia em que o lead chegou; sem as vendas lançadas direto no SGP e sem os fechados fora da conversão). Até 10% de falha é parcial.
2. Todo dia: nenhum follow-up vencido. Medido só na semana atual: o estoque de dias passados não fica guardado.
3. Até sexta (23:59, Santarém): diagnóstico para cada indicador da equipe em atenção ou crítico na semana. Depois do prazo é parcial; sem diagnóstico, não cumprido. Os indicadores da semana vêm da semana congelada da equipe; sem ela, a semana escolhida e a atual são montadas na hora; semanas antigas sem foto ficam "não medido".
4. Sábado: reunião de equipe encerrada, com compromissos.
5. Durante a semana: planos aprovados da equipe atualizados (algum registro na semana) e nenhum atrasado. A situação de cada plano no fim da semana sai do histórico.

Diretoria (direção e administração), toda semana:

6. Segunda: reunião de resultados encerrada, com decisões na ata.
7. Planos e compromissos gerenciais que passaram a aguardar a diretoria decididos em até 2 dias.
8. Planos que passaram a aguardar validação conferidos em até 2 dias.

A rotina vale a partir da semana de 23/11/2026 (a primeira semana inteira com diagnósticos, planos e reuniões no GRR). Antes dela, só o atendimento dos leads é avaliado.

## Onde aparece

- `/grr/rotinas`: a semana escolhida, um cartão por líder, e o cumprimento das últimas seis semanas. A coordenação vê só a própria rotina.
- Modo Apresentação da diretoria: seção "Rotinas das lideranças" da semana apresentada.
- Ata da reunião de resultados: o cumprimento da semana é guardado no encerramento (item 3 da pauta) e sai no PDF.

As regras ficam em `lib/grr/rotinas.ts` (puras, testadas); a leitura em `lib/grr/rotinas-dados.ts`.
