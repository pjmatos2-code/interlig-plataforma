import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { GestaoMotivos } from "./motivos";
import { BotaoSincronizar } from "./botao-sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora, haQuantoTempo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await exigirPerfil(["gestor"]);

  const supabase = criarClienteServidor();
  const [{ data: syncs }, { data: motivos }] = await Promise.all([
    supabase
      .from("vw_ultima_sync")
      .select("entidade, finalizado_em, registros, status, erro")
      .order("entidade"),
    supabase
      .from("motivos_nao_conversao")
      .select("id, nome, ativo")
      .order("ordem"),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Administração"
        descricao="Usuários, metas, de/para de origem e status das sincronizações."
        referencia="PRD 3.10"
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Status das sincronizações</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <BotaoSincronizar />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Em produção o cron chama /api/sync a cada 10 minutos (vercel.json). Modo atual do
              SGP: <code>{process.env.SGP_MODE ?? "mock"}</code> — com as credenciais reais, basta
              preencher o .env e trocar para <code>real</code>.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Entidade</th>
                  <th className="py-2 pr-4 font-medium">Última execução</th>
                  <th className="py-2 pr-4 font-medium">Registros</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(syncs ?? []).map((s) => (
                  <tr key={s.entidade} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{s.entidade}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {formatarDataHora(s.finalizado_em)} ({haQuantoTempo(s.finalizado_em)})
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{s.registros}</td>
                    <td className="py-2">
                      <Badge variant={s.status === "sucesso" ? "verde" : "vermelho"}>
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {(syncs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-muted-foreground">
                      Nenhuma sincronização registrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Motivos de não conversão (CRM)</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoMotivos motivos={motivos ?? []} />
        </CardContent>
      </Card>

      <EmConstrucao
        fase="Fase 1 (básico) e Fase 3 (SZ Chat)"
        entrega={[
          "Convite de usuários, perfis e vínculo usuário ↔ vendedora do SGP",
          "POPs, cidades e seus supervisores",
          "Regras de comissão com vigência (histórico preservado)",
          "De/para de origem de cadastro",
          "Equipes habilitadas do SZ Chat (docs/decisoes.md D1) e atendente ↔ vendedora",
        ]}
      />
    </>
  );
}
