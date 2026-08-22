import Link from "next/link";
import { exigirPerfil } from "@/lib/auth";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { lerConfigSgp, lerConfigSzchat, mascarar } from "@/lib/integracoes/config";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora } from "@/lib/format";
import { PainelSgp, PainelSzchat } from "./paineis";

export const dynamic = "force-dynamic";

export default async function IntegracoesPage() {
  await exigirPerfil(["gestor"]);

  const [sgp, szchat] = await Promise.all([lerConfigSgp(), lerConfigSzchat()]);
  const adminCfg = criarClienteAdmin();
  const { data: cfgSgpRaw } = await adminCfg
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "sgp")
    .maybeSingle();
  const linkClienteSgp =
    ((cfgSgpRaw?.config as Record<string, unknown> | null)?.link_cliente as string) ?? null;

  const admin = criarClienteAdmin();
  const { data: amostras } = await admin
    .from("integracoes_amostras")
    .select("id, sistema, rota, http_status, corpo, coletado_em")
    .eq("sistema", "sgp")
    .order("coletado_em", { ascending: false })
    .limit(16);
  const { data: eventosSz } = await admin
    .from("szchat_eventos_brutos")
    .select("id, recebido_em, content_type, corpo, resultado")
    .order("recebido_em", { ascending: false })
    .limit(12);

  const urlBase =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const urlWebhook = `${urlBase.replace(/\/$/, "")}/api/webhooks/szchat`;

  const sgpPronto = Boolean(sgp.base_url && sgp.token && sgp.app);

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          ← Administração
        </Link>
      </div>
      <CabecalhoPagina
        titulo="Integrações"
        descricao="Autosserviço para conectar o SGP e o SZ Chat — credenciais ficam no banco, nunca aparecem completas e podem ser trocadas a qualquer momento."
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>SGP — dados de vendas, contratos e títulos</CardTitle>
          {sgpPronto ? (
            <Badge variant={sgp.modo === "real" ? "verde" : "amarelo"}>
              {sgp.modo === "real" ? "modo real ativo" : "credenciais salvas · modo demonstração"}
            </Badge>
          ) : (
            <Badge variant="outline">não configurado</Badge>
          )}
        </CardHeader>
        <CardContent>
          <ol className="mb-4 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
            <li>
              No painel do SGP: <strong>Administração → Integrações → Tokens</strong> → criar token
              <strong> somente de consulta</strong> (clientes, contratos, títulos, planos), sem
              permissões de liquidação/cancelamento.
            </li>
            <li>Preencher e salvar abaixo · <strong>Testar conexão</strong> → rotas verdes.</li>
            <li>
              <strong>Executar descoberta</strong>: coleta amostras reais (dados pessoais
              mascarados) para o mapeamento de campos.
            </li>
            <li>
              Com o mapeamento validado, trocar a fonte para <strong>Real</strong> e usar
              &quot;Sincronizar agora&quot; na Administração.
            </li>
          </ol>
          <PainelSgp
            configurado={{
              base_url: sgp.base_url,
              token: mascarar(sgp.token),
              app: sgp.app,
              modo: sgp.modo,
              link_cliente: linkClienteSgp,
            }}
          />
        </CardContent>
      </Card>

      {(amostras ?? []).length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Amostras coletadas do SGP ({(amostras ?? []).length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(amostras ?? []).map((a) => (
              <details key={a.id} className="rounded-md border">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <code className="font-mono text-xs">{a.rota}</code>
                  <Badge variant={a.http_status === 200 ? "verde" : "vermelho"}>
                    HTTP {a.http_status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatarDataHora(a.coletado_em)}
                  </span>
                </summary>
                <pre className="overflow-x-auto border-t bg-muted/30 p-3 font-mono text-xs">
                  {JSON.stringify(a.corpo, null, 2).slice(0, 4000)}
                </pre>
              </details>
            ))}
            <p className="text-xs text-muted-foreground">
              Dados pessoais são mascarados na coleta. Estas amostras alimentam o mapeamento
              campo-a-campo do conector real.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>SZ Chat — tickets automáticos e conversas</CardTitle>
          {szchat.webhook_secret ? (
            <Badge variant="verde">receptor ativo</Badge>
          ) : (
            <Badge variant="outline">segredo pendente</Badge>
          )}
        </CardHeader>
        <CardContent>
          <PainelSzchat
            configurado={{
              base_url: szchat.base_url,
              api_token: mascarar(szchat.api_token),
              temSegredo: Boolean(szchat.webhook_secret),
            }}
            urlWebhook={urlWebhook}
          />
        </CardContent>
      </Card>

      {(eventosSz ?? []).length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Eventos recebidos do SZ Chat ({(eventosSz ?? []).length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Cada chamada ao webhook é registrada aqui — use para conferir o formato real do
              payload e o resultado (criado / ignorado / capturado para mapeamento).
            </p>
            {(eventosSz ?? []).map((e) => (
              <details key={e.id} className="rounded-md border">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <Badge
                    variant={
                      String(e.resultado).startsWith("criado")
                        ? "verde"
                        : String(e.resultado).startsWith("ignorado") || String(e.resultado).startsWith("recusado")
                          ? "vermelho"
                          : "amarelo"
                    }
                  >
                    {e.resultado}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{e.content_type}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatarDataHora(e.recebido_em)}
                  </span>
                </summary>
                <pre className="overflow-x-auto border-t bg-muted/30 p-3 font-mono text-xs">
                  {JSON.stringify(e.corpo, null, 2).slice(0, 3000)}
                </pre>
              </details>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Equipes que geram ticket (filtro por fluxo) e o mapeamento atendente ↔ vendedora ficam na{" "}
        <Link href="/admin" className="underline">
          Administração
        </Link>
        . Detalhes técnicos: docs/decisoes.md no repositório.
      </p>
    </>
  );
}
