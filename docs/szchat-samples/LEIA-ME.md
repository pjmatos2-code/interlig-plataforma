# Amostras do SZ Chat

`transferencia.json` — payload de exemplo do evento de transferência de
conversa para uma Equipe comercial (formato assumido; será confirmado com a
Fortics na Fase 0 — PRD 7.1). O endpoint /api/webhooks/szchat aceita este
payload, valida o segredo (SZCHAT_WEBHOOK_SECRET) e é idempotente pelo
`evento_id`.

Regra D1 (docs/decisoes.md): só conversas direcionadas a uma Equipe comercial
HABILITADA no admin geram ticket; as demais são registradas em log e ignoradas.

Teste local:
  curl -X POST http://localhost:3000/api/webhooks/szchat \
    -H "Content-Type: application/json" \
    -H "x-szchat-secret: $SZCHAT_WEBHOOK_SECRET" \
    -d @docs/szchat-samples/transferencia.json
