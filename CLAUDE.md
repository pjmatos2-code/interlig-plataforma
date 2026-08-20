# Plataforma de Inteligência Comercial — Interlig

## Fonte da verdade
A especificação completa está em `docs/PRD.md`. **Sempre consulte o PRD antes de implementar qualquer tela ou cálculo.** Em caso de dúvida entre este arquivo e o PRD, o PRD vence.

## Regras inegociáveis
- **Indicadores:** implementar EXATAMENTE as regras da seção 5 do PRD (pace, projeção, churn precoce, conversão real etc.). Nunca inventar fórmula. Cada regra da seção 5 deve ter teste automatizado.
- **Perfis de acesso:** seguir a matriz da seção 2 do PRD, implementada via RLS no Supabase (não só no frontend).
- **CRM:** ticket nunca pode ser excluído; fechamento sempre exige desfecho (seção 3.9).
- **Dashboard nunca consulta API externa em tempo de renderização** — lê apenas do banco (seção 7.1).

## Stack (fixada — não trocar sem pedir)
- Next.js 14+ (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres + Auth + RLS)
- Recharts (gráficos) | react-leaflet + OpenStreetMap (mapa)
- Worker de sync via cron (Vercel Cron ou Supabase Edge Function)

## Convenções
- UI 100% em português do Brasil. Moeda em R$, datas dd/mm/aaaa, fuso America/Santarem.
- Nomes de tabelas e campos conforme seção 7.2 do PRD (em português).
- Mobile-first: gestor e vendedoras acessam muito pelo celular; modo TV é desktop.
- Commits pequenos por módulo, mensagens em português.

## Modo de desenvolvimento (IMPORTANTE — fase atual)
- As credenciais do SGP e do SZ Chat **ainda não existem**. Todo o desenvolvimento roda com o seed de dados fictícios (`supabase/seed.sql`).
- O worker de sync deve ser construído atrás de uma interface (`lib/sgp/client.ts`) com duas implementações: `SgpApiClient` (real, usa `SGP_BASE_URL`, `SGP_TOKEN`, `SGP_APP` do `.env`) e `SgpMockClient` (lê fixtures de `docs/sgp-samples/`). Selecionar via `SGP_MODE=mock|real`.
- Mesmo padrão para o SZ Chat (`SZCHAT_MODE=mock|real`), com endpoint `/api/webhooks/szchat` testável via payload de exemplo.
- Assim, quando as credenciais chegarem, ligar os dados reais = preencher o `.env` e trocar o modo. Nenhuma tela muda.

## Seed de dados fictícios (base de teste)
Gerar `supabase/seed.sql` com dados realistas de um provedor de fibra no Pará:
- 3 POPs/cidades, 8 vendedoras, 6 planos (200MB a 1GB, R$ 79,90–149,90)
- ~600 contratos distribuídos nos últimos 12 meses (sazonalidade, com datas de venda/assinatura/ativação e ~8% cancelados, parte em <90 dias para testar churn precoce)
- ~80 contratos do mês atual em vários status (pendente assinatura, aguardando ativação, ativos)
- Títulos financeiros com ~7% de inadimplência de 1ª fatura
- ~150 tickets de CRM em todas as etapas e desfechos, com motivos de não conversão variados
- Metas do mês vigente por vendedora e regra de comissão de exemplo com 3 degraus
- Origens distribuídas entre venda externa, tráfego pago, presencial e indicação
- Bairros reais das cidades de atuação para o mapa de calor
