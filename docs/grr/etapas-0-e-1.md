# GRR, Gestão da Rotina de Resultados — Etapas 0 e 1

Registro técnico do início do módulo (18/11/2026). O GRR é uma camada de gestão sobre os dados que a plataforma já tem: a diretoria e as lideranças acompanham indicadores, analisam desvios, combinam planos de ação e registram as reuniões. Ele não substitui os dashboards, o CRM nem o Relatório da diretoria.

Esta entrega cobre a preparação técnica (Etapa 0) e o painel do GRR Comercial em modo de leitura (Etapa 1). Não há migração, não há gravação e nenhum cálculo existente foi alterado.

## O que a Etapa 1 entrega

- Entrada no menu, "GRR, Gestão de Resultados", para administração, direção e coordenação. Agentes não acessam.
- Resumo executivo em `/grr`: cartões com realizado, meta (quando existe), evolução e farol, agrupados em vendas e metas, ativações, conversão comercial, ticket médio e receita, produtividade dos agentes, e motivos de perda e follow-up.
- Detalhe de cada grupo em `/grr/<grupo>`: números de apoio, evolução das últimas 8 semanas, quebras por unidade, equipe e agente e, na conversão e nas perdas, a lista dos tickets que compõem a semana, com link para a ficha no CRM.
- Filtros no endereço da tela: semana, unidade, equipe e agente. O painel abre na semana atual, comparada com a anterior, e tem o atalho "Última semana completa", que é a semana da reunião.
- As áreas previstas (reuniões, planos de ação, rotinas das lideranças, histórico e relatórios) aparecem na navegação com a etapa em que entram.
- Inadimplência da primeira fatura e churn precoce aparecem como "Previsto na Etapa 5".

## Arquivos

Novos:

- `lib/grr/catalogo.ts`: grupos de indicadores, a regra oficial de cada um e as áreas do módulo. Na Etapa 2 o catálogo passa para o banco.
- `lib/grr/semana.ts`: semana de segunda a domingo no fuso de Santarém, com as funções de `lib/relatorio-semanal/periodo.ts`.
- `lib/grr/escopo.ts`: quem vê o quê e o que pode filtrar.
- `lib/grr/regras.ts`: regras de composição (meta do recorte, meta do trecho, faróis, quem aguarda instalação, data de referência do ticket, trechos de comparação).
- `lib/grr/montar.ts`: montagem dos cartões, das quebras e da evolução. Função pura.
- `lib/grr/dados.ts`: leitura do banco com a sessão de quem abriu a tela.
- `lib/grr/*.test.ts`: 50 testes.
- `app/(app)/grr/page.tsx`, `app/(app)/grr/[grupo]/page.tsx`, `app/(app)/grr/carregar.ts`.
- `components/grr/`: `areas.tsx`, `filtros.tsx`, `cartao-indicador.tsx`, `detalhes.tsx`.

Alterados (só a entrada no menu): `lib/nav.ts` e `components/layout/app-shell.tsx`.

## Regras de cada indicador

Toda fórmula vem de `lib/indicadores/`. O GRR escolhe o trecho, o recorte e o texto.

| Grupo | Regra oficial |
|---|---|
| Vendas e metas | `vendasDoPeriodo` (5.1) e `percentualMeta` (5.4). Prefeitura e rede neutra ficam fora, pela decisão de 24/10/2026 (`foraDasVendas`), como no Relatório da diretoria. |
| Ativações | `pendentesAssinatura` (5.8), `ativacoesPendentes` (5.7) com as OS abertas do SGP (D9), `taxaInstalacaoEfetiva` (5.9) e `tempoMedioVendaAtivacao`. |
| Conversão comercial | `conversaoReal` (5.14) e `foraDaConversao`, sem alteração. Leads recebidos seguem a conta do painel do CRM. |
| Ticket médio e receita | `receitaContratada` (5.2) e `ticketMedio` (5.3). |
| Produtividade dos agentes | As mesmas contas, por agente. |
| Motivos de perda e follow-up | `separarNaoConvertidos`, `tempoPrimeiraTratativa` (5.15), retorno agendado no ticket e ações agendadas (`ticket_acoes`). |

Regras que hoje vivem dentro dos serviços das telas e ganharam função própria, testada, em `lib/grr/regras.ts`:

- **Meta do recorte** (`metaDoEscopo`): a decisão "Meta por unidade" de 23/09/2026. Agente e equipe somam as metas individuais; a unidade usa a meta cadastrada ou a soma dos agentes ativos, sem coordenadores; a empresa usa a meta global ou a soma das unidades. A mesma conta existe no Dashboard, na TV e no Relatório da diretoria.
- **Meta da semana e faróis**: meta do mês dividida pelos dias de expediente, com os limites do Relatório da diretoria (`LIMITES` em `lib/relatorio-semanal/placar.ts`). O ritmo considera só dias completos; a semana em andamento conta até ontem.
- **Quem aguarda instalação** (`aguardandoInstalacao`): OS de instalação aberta ou assinado sem ativação.
- **Data de referência do ticket** (`dataRefTicket`): convertido conta no dia da venda do contrato ligado; os demais, no dia do fechamento, no fuso de Santarém.

Só três cartões têm farol na Etapa 1, porque são os que já têm regra: vendas contra a meta, assinatura parada há 48h ou mais e instalação parada há mais de 7 dias. Os outros mostram "Sem meta" até a Etapa 2.

## Acesso

- `exigirPerfil(["gestor", "direcao", "supervisor"])` em toda tela do GRR.
- A leitura usa a sessão de quem abriu (`criarClienteServidor`), então a permissão por linha do banco vale por baixo.
- O recorte do GRR é aplicado por cima (`resolverEscopo`): direção e administração veem a empresa e filtram por unidade, equipe e agente; quem coordena agentes fica preso à própria equipe (o time que vale no mês, como no Dashboard); quem não coordena agentes fica preso à própria unidade. Unidade, equipe ou agente fora do recorte, vindos pelo endereço, são ignorados.

## Diferenças encontradas

1. **Conversão.** A regra atual (5.14) divide convertidos por tickets fechados no período. A definição gerencial pede convertidos sobre leads elegíveis atendidos, por safra de leads. Diferenças medidas:
   - a regra atual conta como convertido o ticket criado a partir de venda lançada direto no SGP, sem atendimento;
   - conta mais de uma vez a venda que tem mais de um ticket convertido no mesmo contrato;
   - oscila na virada do mês, quando a rotina fecha os tickets abertos do mês anterior;
   - no CRM o dia do fechamento é cortado pelo horário UTC, e no GRR pelo de Santarém.
   Proposta: criar uma função nova, `conversaoPorSafra`, ao lado de `conversaoReal`, usada só no GRR. Nada muda no CRM, nas comissões nem nos dashboards.
2. **Venda que conta.** O Dashboard soma Prefeitura e rede neutra; o Relatório da diretoria não. **Decidido em 18/11/2026:** o GRR segue o relatório. Esses contratos não têm vendedor, então não contariam para ninguém. O painel mostra a diferença em aviso.
3. **Inadimplência da primeira fatura.** A regra 5.11 dá 10 dias de tolerância e conta como inadimplente quem pagou depois desse prazo. A definição gerencial fala em fatura vencida e não paga. **Decidido em 18/11/2026:** fica pendente, para tratar mais à frente.
4. **Data de ativação.** Nos contratos recentes a data de ativação gravada é a mesma da venda, porque o contrato já chega ativo do SGP e o leitor usa a data de cadastro. O painel avisa quando isso acontece. A correção da origem está sendo tratada numa frente separada, no sync; quando as datas forem reais, o aviso some sozinho.
5. **Conclusão do retorno.** Concluir o retorno simples do ticket apaga a data e não guarda quando foi feito. Só as ações agendadas e o follow-up com IA têm registro de conclusão.

## Decisões do Paulo depois da prévia (18/11/2026)

- **Publicar a Etapa 1.** O painel em modo de leitura vai para o ar.
- **Conversão gerencial:** ainda sem decisão. O painel segue com a regra oficial (5.14).
- **Módulo independente no futuro.** O GRR pode virar uma plataforma própria, usada por outras unidades de negócio, cada uma lendo o seu SGP. Por isso, a partir da Etapa 2:
  - as tabelas do GRR ficam isoladas das tabelas da plataforma, em esquema próprio no Supabase;
  - toda tabela do GRR nasce com a chave da empresa (unidade de negócio), mesmo havendo uma só hoje;
  - o GRR lê vendas, tickets e metas por uma camada única (`lib/grr/dados.ts`), para trocar a fonte sem mexer nas telas.
- **Ambiente de teste isolado:** autorizado. As migrações das próximas etapas são testadas fora das tabelas de produção antes de qualquer aplicação.

## Conferência da permissão por linha

Antes de publicar, as leituras do GRR foram repetidas no banco com o papel de cada perfil (direção, administração, coordenação de equipe e coordenação de unidade), em transação somente leitura. Todas as tabelas respondem, e cada perfil recebe só o seu recorte.

## O que não foi feito, de propósito

- Nenhuma migração. O catálogo fica no código até a Etapa 2.
- Nenhuma mudança em `lib/indicadores/`, `lib/crm/`, `lib/comissao/`, `lib/sgp/`, `lib/sz/` ou `lib/sync/`.
- Metas por indicador, faixas configuráveis e fotos congeladas (Etapa 2), diagnósticos e planos de ação (Etapa 3), reuniões e PDF (Etapa 4), qualidade da venda (Etapa 5).

## Como conferir

- `npx vitest run`, `npx tsc --noEmit -p .` e `npm run build`.
- Na última semana completa, vendas, receita e meta do GRR batem com o Relatório da diretoria da mesma semana, salvo o que mudou nos dados depois que o relatório foi gerado.
- Perfis: administração, direção e coordenação abrem; os demais caem em "sem acesso". A coordenação não troca de unidade nem de equipe.
- Largura de celular (390 px): sem rolagem lateral da página; as tabelas rolam dentro do próprio quadro.
