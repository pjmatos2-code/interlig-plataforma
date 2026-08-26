import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { carregarTicket } from "@/lib/crm/dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { podeReabrir } from "@/lib/indicadores/crm";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarData, formatarDataHora } from "@/lib/format";
import { ROTULO_ETAPA, ROTULO_ORIGEM, ehVendedora } from "@/lib/tipos";
import {
  BarraEtapas,
  BotaoReabrir,
  BotaoExcluir,
  FormularioFechamento,
  FormularioFollowup,
  FormularioNota,
  FormularioProposta,
  FormularioReatribuir,
} from "./painel-acoes";
import { formatarMoeda } from "@/lib/format";
import { FollowupFeito } from "@/components/crm/followup-feito";
import { AcoesAgendadas, type AcaoAgendada } from "@/components/crm/acoes-agendadas";

export const dynamic = "force-dynamic";

const ROTULO_EVENTO: Record<string, string> = {
  criacao: "Ticket criado",
  mudanca_etapa: "Mudança de etapa",
  nota: "Nota",
  reatribuicao: "Reatribuição",
  fechamento: "Fechamento",
  reabertura: "Reabertura",
  webhook_sz: "Evento do SZ Chat",
  reconciliacao: "Reconciliação com o SGP",
};

export default async function TicketPage({ params }: { params: { id: string } }) {
  const usuario = await exigirUsuario();
  const t = await carregarTicket(params.id);
  if (!t) notFound();
  const linkSgp = aplicarLinkSgp(await templateLinkSgp(), {
    clienteId: t.cliente_sgp_id,
    contratoId: t.contrato_sgp_id,
    cpf: t.cpf,
  });

  const supabase = criarClienteServidor();
  const [{ data: planos }, { data: motivos }, { data: vendedoras }] = await Promise.all([
    supabase
      .from("planos")
      .select("id, nome, velocidade, valor_referencia")
      .eq("ativo", true)
      .order("valor_referencia", { ascending: false }),
    supabase
      .from("motivos_nao_conversao")
      .select("id, nome")
      .eq("ativo", true)
      .order("ordem"),
    ehVendedora(usuario.perfil)
      ? Promise.resolve({ data: [] as { id: string; nome: string }[] })
      : supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // ações agendadas do ticket (lembretes)
  const { data: acoesAgendadas } = await supabase
    .from("ticket_acoes")
    .select("id, descricao, quando, concluida_em, notificado_em")
    .eq("ticket_id", t.id)
    .order("quando", { ascending: true })
    .limit(30);

  // visita externa (fotos em bucket privado -> URLs assinadas por 1h)
  const { data: visita } = await supabase
    .from("visitas_externas")
    .select("foto_casa_path, foto_doc_path, lat, lng, precisao_m, criado_em")
    .eq("ticket_id", t.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  let fotoCasaUrl: string | null = null;
  let fotoDocUrl: string | null = null;
  if (visita) {
    const admin = criarClienteAdmin();
    const assinar = async (path: string | null) =>
      path
        ? (await admin.storage.from("venda-externa").createSignedUrl(path, 3600)).data?.signedUrl ?? null
        : null;
    fotoCasaUrl = await assinar(visita.foto_casa_path);
    fotoDocUrl = await assinar(visita.foto_doc_path);
  }

  const fechado = t.etapa === "fechado";
  const reabrivel = podeReabrir(t, new Date().toISOString());
  const podeReatribuir = !ehVendedora(usuario.perfil);

  return (
    <>
      <div className="mb-1 text-sm">
        <Link href="/crm" className="text-muted-foreground hover:text-foreground">
          ← CRM
        </Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <CabecalhoPagina titulo={t.cliente_nome} />
        <Badge variant={fechado ? (t.desfecho === "convertido" ? "verde" : "vermelho") : "secondary"}>
          {fechado
            ? t.desfecho === "convertido"
              ? "Convertido"
              : t.fechado_por === "auto_inatividade"
                ? "Não convertido · fechado por inatividade"
                : "Não convertido"
            : ROTULO_ETAPA[t.etapa]}
        </Badge>
        {t.origem_criacao === "sz_auto" && <Badge variant="outline">via SZ Chat</Badge>}
        {t.origem_criacao === "site" && <Badge variant="outline">via Site</Badge>}
      </div>

      {t.resumo_tratativa && (
        <div
          className={
            "mb-4 rounded-xl border p-4 " +
            (t.urgencia === "alta"
              ? "border-rose-300 bg-rose-50/60"
              : t.urgencia === "media"
                ? "border-amber-300 bg-amber-50/60"
                : "border-emerald-300 bg-emerald-50/60")
          }
        >
          <p className="mb-1 flex items-center gap-2 text-sm font-bold">
            🔔 Follow-up pendente
            <span
              className={
                "rounded-full px-2 py-0.5 text-[11px] font-black uppercase " +
                (t.urgencia === "alta"
                  ? "bg-rose-500 text-white"
                  : t.urgencia === "media"
                    ? "bg-amber-400 text-amber-950"
                    : "bg-emerald-500 text-white")
              }
            >
              {t.urgencia === "alta" ? "Alta" : t.urgencia === "media" ? "Média" : "Baixa"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{t.resumo_tratativa}</p>
          {t.proxima_abordagem && (
            <p className="mt-2 text-sm font-medium">➜ {t.proxima_abordagem}</p>
          )}
          {t.urgencia !== null && (
            <div className="mt-3">
              <FollowupFeito ticketId={t.id} />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Coluna 1: dados */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <span className="text-muted-foreground">Telefone:</span>
              {t.telefone ? (
                <>
                  {t.telefone}
                  <a
                    href={`https://wa.me/${(t.telefone.replace(/\D/g, "").length <= 11 ? "55" : "") + t.telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-farol-verde/15 px-1.5 py-0.5 text-xs font-medium text-farol-verde hover:underline"
                    title="Abrir conversa no WhatsApp"
                  >
                    WhatsApp ↗
                  </a>
                </>
              ) : (
                "—"
              )}
            </p>
            <p>
              <span className="text-muted-foreground">Fonte:</span>{" "}
              {t.origem_criacao === "sz_auto" ? "WhatsApp / SZ Chat" : t.origem_criacao === "site" ? "Site (Contratar Online)" : "Cadastro manual"}
            </p>
            <p><span className="text-muted-foreground">CPF:</span> {t.cpf ?? "—"}</p>
            <p><span className="text-muted-foreground">Vendedora:</span> {t.vendedora ?? "Não atribuído"}</p>
            <p><span className="text-muted-foreground">POP:</span> {t.pop ?? "—"}</p>
            <p><span className="text-muted-foreground">Criado em:</span> {formatarDataHora(t.criado_em)}</p>
            <p>
              <span className="text-muted-foreground">1ª tratativa:</span>{" "}
              {t.primeira_tratativa_em ? formatarDataHora(t.primeira_tratativa_em) : "ainda não houve"}
            </p>
            {t.followup_em && (
              <p>
                <span className="text-muted-foreground">Retorno combinado:</span>{" "}
                {formatarData(t.followup_em.slice(0, 10))}
              </p>
            )}
            {t.sz_conversa_id && (
              <p>
                <span className="text-muted-foreground">Conversa SZ:</span> {t.sz_conversa_id}
              </p>
            )}
            {fechado && (
              <>
                <hr className="my-2" />
                <p><span className="text-muted-foreground">Fechado em:</span> {formatarDataHora(t.fechado_em)}</p>
                {t.desfecho === "convertido" ? (
                  <>
                    <p><span className="text-muted-foreground">Plano vendido:</span> {t.plano ?? "—"}</p>
                    <p>
                      <span className="text-muted-foreground">Origem:</span>{" "}
                      {t.origem_cadastro ? ROTULO_ORIGEM[t.origem_cadastro] : "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Contrato SGP:</span>{" "}
                      {t.contrato_id ? (
                        t.contrato_sgp_id && linkSgp ? (
                          <a
                            href={linkSgp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-interlig-ceu hover:underline"
                            title="Abrir contrato no SGP"
                          >
                            #{t.contrato_sgp_id} ↗
                          </a>
                        ) : (
                          <Badge variant="verde">reconciliado</Badge>
                        )
                      ) : (
                        <Badge variant="amarelo">aguardando reconciliação</Badge>
                      )}
                    </p>
                  </>
                ) : (
                  <p><span className="text-muted-foreground">Motivo:</span> {t.motivo ?? "—"}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Coluna 2: ações */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{fechado ? "Ticket fechado" : "Tratativa"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!fechado && (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Etapa</p>
                  <BarraEtapas ticketId={t.id} etapaAtual={t.etapa} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Nota rápida</p>
                  <FormularioNota ticketId={t.id} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Follow-up</p>
                  <FormularioFollowup ticketId={t.id} atual={t.followup_em} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Ações agendadas ⏰
                  </p>
                  <AcoesAgendadas
                    ticketId={t.id}
                    acoes={(acoesAgendadas ?? []) as AcaoAgendada[]}
                  />
                </div>
                {podeReatribuir && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Reatribuir</p>
                    <FormularioReatribuir
                      ticketId={t.id}
                      vendedoras={vendedoras ?? []}
                      atualId={t.vendedor_id}
                    />
                  </div>
                )}
              </>
            )}

            {fechado && (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Ticket fechado é imutável — e não pode ser excluído por ninguém (PRD 3.9).
                </p>
                {reabrivel ? (
                  <BotaoReabrir ticketId={t.id} />
                ) : (
                  t.desfecho === "nao_convertido" && (
                    <p className="text-xs">Janela de reabertura (30 dias) expirada.</p>
                  )
                )}
              </div>
            )}

            {/* Exclusão administrativa — só o Administrador (limpeza/testes) */}
            {usuario.perfil === "gestor" && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Administração
                </p>
                <BotaoExcluir ticketId={t.id} cliente={t.cliente_nome} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Coluna 3: fechamento */}
        {!fechado && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle>Fechar com desfecho</CardTitle>
            </CardHeader>
            <CardContent>
              <FormularioFechamento
                ticketId={t.id}
                telefone={t.telefone}
                cpf={t.cpf}
                planos={planos ?? []}
                motivos={motivos ?? []}
              />
            </CardContent>
          </Card>
        )}

        {/* Visita externa (PAP) */}
        {visita && (
          <Card className="xl:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle>Visita externa 🚶</CardTitle>
              <p className="text-sm text-muted-foreground">
                Registrada em {formatarDataHora(visita.criado_em)}
                {visita.lat && visita.lng && (
                  <>
                    {" · "}
                    <a
                      href={`https://www.google.com/maps?q=${visita.lat},${visita.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-interlig-ceu hover:underline"
                    >
                      📍 abrir no mapa (±{Math.round(visita.precisao_m ?? 0)} m)
                    </a>
                  </>
                )}
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {fotoCasaUrl && (
                <a href={fotoCasaUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Frente da casa</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoCasaUrl}
                    alt="Frente da casa"
                    className="h-44 w-64 rounded-lg border object-cover"
                  />
                </a>
              )}
              {fotoDocUrl ? (
                <a href={fotoDocUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Documento (pré-cadastro)
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fotoDocUrl}
                    alt="Documento do cliente"
                    className="h-44 w-64 rounded-lg border object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-44 w-64 flex-col items-center justify-center gap-1 self-end rounded-lg border border-dashed text-muted-foreground">
                  <span className="text-xl">🪪</span>
                  <p className="text-xs">Documento não anexado</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Propostas / Produtos */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle>Propostas / Produtos</CardTitle>
            {t.propostas.length > 0 && (
              <span className="text-sm text-muted-foreground">
                Valor da negociação:{" "}
                <span className="font-semibold text-interlig-azul">
                  {formatarMoeda(t.valor_estimado ?? t.propostas[0].valor)}
                </span>
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {t.propostas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma proposta registrada. Escolha o plano abaixo — o valor de tabela é sugerido
                automaticamente e pode ser ajustado para o valor negociado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-1.5 pr-3 font-medium">Plano / produto</th>
                      <th className="pb-1.5 pr-3 font-medium">Valor mensal</th>
                      <th className="pb-1.5 pr-3 font-medium">Observação</th>
                      <th className="pb-1.5 pr-3 font-medium">Registrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.propostas.map((p, i) => (
                      <tr key={p.id} className={i === 0 ? "font-medium" : "text-muted-foreground"}>
                        <td className="py-1.5 pr-3">
                          {p.plano ?? p.descricao ?? "—"}
                          {p.velocidade && (
                            <span className="ml-1 text-xs text-muted-foreground">· {p.velocidade}</span>
                          )}
                          {i === 0 && (
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              atual
                            </Badge>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">{formatarMoeda(p.valor)}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{p.observacao ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                          {formatarData(p.criado_em.slice(0, 10))}
                          {p.usuario ? ` · ${p.usuario}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!fechado && (
              <div className="rounded-md border bg-muted/30 p-3">
                <FormularioProposta ticketId={t.id} planos={planos ?? []} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className={fechado ? "xl:col-span-1" : "xl:col-span-3"}>
          <CardHeader className="pb-2">
            <CardTitle>Histórico ({t.eventos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5 text-sm">
              {t.eventos.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatarDataHora(e.criado_em)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {ROTULO_EVENTO[e.tipo] ?? e.tipo}
                      {e.usuario && (
                        <span className="font-normal text-muted-foreground"> · {e.usuario}</span>
                      )}
                    </p>
                    {typeof e.dados.texto === "string" && (
                      <p className="text-muted-foreground">{e.dados.texto}</p>
                    )}
                    {typeof e.dados.de === "string" && typeof e.dados.para === "string" && (
                      <p className="text-xs text-muted-foreground">
                        {ROTULO_ETAPA[e.dados.de as keyof typeof ROTULO_ETAPA] ?? e.dados.de} →{" "}
                        {ROTULO_ETAPA[e.dados.para as keyof typeof ROTULO_ETAPA] ?? e.dados.para}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
