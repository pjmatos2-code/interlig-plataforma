import { exigirPerfil } from "@/lib/auth";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { EmConstrucao } from "@/components/layout/em-construcao";
import { criarClienteServidor } from "@/lib/supabase/server";
import { GestaoMotivos } from "./motivos";
import { GestaoUsuarios, GestaoOrigens, GestaoSzChat, GestaoCoordenacoes, GestaoPlanosExterna } from "./cadastros";
import { BotaoSincronizar } from "./botao-sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora, haQuantoTempo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await exigirPerfil(["gestor"]);

  const supabase = criarClienteServidor();
  const [
    { data: syncs },
    { data: motivos },
    { data: usuarios },
    { data: pops },
    { data: vendedoras },
    { data: origens },
    { data: atendentes },
    { data: equipes },
    { data: vendedorasCoord },
    { data: planosExterna },
  ] = await Promise.all([
    supabase
      .from("vw_ultima_sync")
      .select("entidade, finalizado_em, registros, status, erro")
      .order("entidade"),
    supabase.from("motivos_nao_conversao").select("id, nome, ativo").order("ordem"),
    supabase
      .from("usuarios")
      .select("id, nome, email, perfil, ativo, pops!usuarios_pop_id_fkey(nome), vendedores!usuarios_vendedor_fk(nome)")
      .order("nome"),
    supabase.from("pops").select("id, nome").order("nome"),
    supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("origem_map").select("id, valor_sgp, categoria").order("valor_sgp"),
    supabase
      .from("sz_atendentes_map")
      .select("id, sz_atendente_id, sz_atendente_nome, vendedores(nome)")
      .order("sz_atendente_id"),
    supabase.from("sz_equipes_habilitadas").select("id, nome, ativo, pops(nome)").order("nome"),
    supabase.from("vendedores").select("id, nome, coordenador_id").eq("ativo", true).order("nome"),
    supabase
      .from("planos")
      .select("id, nome, valor_referencia, venda_externa")
      .eq("ativo", true)
      .gt("valor_referencia", 0)
      .order("nome"),
  ]);

  type Rel = { nome: string } | null;

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

      <Card className="mb-6 border-interlig-ceu/50">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Integrações (SGP e SZ Chat)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            Módulo de autosserviço para o responsável pela integração: credenciais, teste de
            conexão, descoberta de endpoints e evento de teste do webhook.
          </p>
          <a href="/admin/integracoes" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Abrir módulo de integrações →
          </a>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Usuários e perfis</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoUsuarios
            usuarios={(usuarios ?? []).map((u) => ({
              id: u.id,
              nome: u.nome,
              email: u.email,
              perfil: u.perfil,
              ativo: u.ativo,
              pop: (u.pops as unknown as Rel)?.nome ?? null,
              vendedora: (u.vendedores as unknown as Rel)?.nome ?? null,
            }))}
            pops={pops ?? []}
            vendedoras={vendedoras ?? []}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Coordenações — agentes sob cada coordenador</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoCoordenacoes
            coordenadores={(usuarios ?? [])
              .filter((u) => u.perfil === "supervisor" && u.ativo)
              .map((u) => ({ id: u.id, nome: u.nome, email: u.email }))}
            vendedoras={(vendedorasCoord ?? []).map((v) => ({
              id: v.id,
              nome: v.nome,
              coordenador_id: v.coordenador_id ?? null,
            }))}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Planos da Venda Externa (PAP)</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoPlanosExterna
            planos={(planosExterna ?? []).map((p) => ({
              id: p.id,
              nome: p.nome,
              valor_referencia: Number(p.valor_referencia ?? 0),
              venda_externa: Boolean(p.venda_externa),
            }))}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>De/para de origem de cadastro (SGP → plataforma)</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoOrigens origens={origens ?? []} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>SZ Chat — mapeamentos da integração</CardTitle>
        </CardHeader>
        <CardContent>
          <GestaoSzChat
            atendentes={(atendentes ?? []).map((a) => ({
              id: a.id,
              sz_atendente_id: a.sz_atendente_id,
              sz_atendente_nome: a.sz_atendente_nome,
              vendedora: (a.vendedores as unknown as Rel)?.nome ?? "—",
            }))}
            equipes={(equipes ?? []).map((e) => ({
              id: e.id,
              nome: e.nome,
              ativo: e.ativo,
              pop: (e.pops as unknown as Rel)?.nome ?? null,
            }))}
            vendedoras={vendedoras ?? []}
            pops={pops ?? []}
          />
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Parâmetros do CRM</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Fechamento automático por inatividade: <strong>{process.env.CRM_DIAS_INATIVIDADE ?? 15} dias</strong> ·
            janela de reabertura: <strong>{process.env.CRM_DIAS_REABERTURA ?? 30} dias</strong> ·
            janela de reconciliação: <strong>{process.env.CRM_DIAS_RECONCILIACAO ?? 7} dias</strong>
          </p>
          <p className="mt-1 text-xs">
            Definidos por variáveis de ambiente (Vercel → Settings → Environment Variables).
          </p>
        </CardContent>
      </Card>

      <EmConstrucao
        fase="próxima iteração"
        entrega={[
          "Cadastro de POPs/cidades pela tela (hoje via seed/SQL)",
          "Edição de regras de comissão pela tela (hoje parametrizadas no banco)",
        ]}
      />
    </>
  );
}
