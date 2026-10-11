import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { carregarTicket } from "@/lib/crm/dados";
import { templateLinkSgp } from "@/lib/sgp/links-server";
import { aplicarLinkSgp } from "@/lib/sgp/links";
import { podeReabrir } from "@/lib/indicadores/crm";
import { criarClienteServidor } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import { formatarData, formatarDataHora } from "@/lib/format";
import { ROTULO_ETAPA, ROTULO_ORIGEM, ehAgenteCrm } from "@/lib/tipos";
import { FollowupIa } from "@/components/crm/followup-ia";
import { AnexosVisita } from "@/components/crm/anexos-visita";
import { EmailTicket } from "@/components/crm/email-ticket";
import { CpfTicket } from "@/components/crm/cpf-ticket";
import { ScoreTicket } from "@/components/crm/score-ticket";
import { ConsultaCredito } from "@/components/crm/consulta-credito";
import { TelefoneTicket } from "@/components/crm/telefone-ticket";
import {
  BarraEtapas,
  BotaoReabrir,
  BotaoExcluir,
  FormularioFechamento,
  FormularioTratativa,
  FormularioFollowup,
  FormularioProposta,
  FormularioReatribuir,
} from "./painel-acoes";
import { cn } from "@/lib/utils";
import { AbasTicket } from "@/components/crm/abas-ticket";
import { MaisAcoes, MenuOpcoes } from "@/components/crm/menu-ticket";
import { BotaoEditarDados, ModoEdicaoProvider } from "@/components/crm/modo-edicao";
import {
  ArrowLeft, CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink,
  FileText, Gauge, Headset, IdCard, Mail, MapPin, MessageCircle, MessageSquare, Package, Paperclip,
  Phone, Plus, Settings, Trophy, User, UserCheck, UserCog, XCircle,
} from "lucide-react";
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
      .select("id, nome, velocidade, valor_referencia, venda_externa, setor_corporativo")
      .eq("ativo", true)
      .order("valor_referencia", { ascending: false }),
    supabase
      .from("motivos_nao_conversao")
      .select("id, nome")
      .eq("ativo", true)
      .lt("ordem", 90) // "Mês encerrado sem conversão" é só da rotina da virada
      .order("ordem"),
    ehAgenteCrm(usuario.perfil)
      ? Promise.resolve({ data: [] as { id: string; nome: string }[] })
      : supabase.from("vendedores").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  // vendedora externa só enxerga os planos do PAP marcados no Administração
  // (mesma régua do formulário de visita; nenhum marcado = todos)
  const planosPermitidos = (() => {
    if (usuario.perfil === "vendedora_externa") {
      const doPap = (planos ?? []).filter((p) => p.venda_externa);
      return doPap.length > 0 ? doPap : (planos ?? []);
    }
    if (usuario.perfil === "agente_corporativo") {
      const doSetor = (planos ?? []).filter((p) => p.setor_corporativo);
      return doSetor.length > 0 ? doSetor : (planos ?? []);
    }
    return planos ?? [];
  })();

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
    .select("foto_casa_path, foto_doc_path, foto_doc_verso_path, endereco_manual, lat, lng, precisao_m, criado_em")
    .eq("ticket_id", t.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  let fotoCasaUrl: string | null = null;
  let fotoDocUrl: string | null = null;
  let fotoVersoUrl: string | null = null;
  if (visita) {
    const admin = criarClienteAdmin();
    const assinar = async (path: string | null) =>
      path
        ? (await admin.storage.from("venda-externa").createSignedUrl(path, 3600)).data?.signedUrl ?? null
        : null;
    fotoCasaUrl = await assinar(visita.foto_casa_path);
    fotoDocUrl = await assinar(visita.foto_doc_path);
    fotoVersoUrl = await assinar(visita.foto_doc_verso_path ?? null);
  }

  // consulta de crédito Consult Center (versões — a mais nova é a vigente)
  const { data: consultasCc } = await supabase
    .from("consultas_credito")
    .select(
      "id, versao, nome_titular, cpf, score, faixa, adiantamento_valor, protocolo, consulta_em, pendencias_qtd, pendencias_valor, pendencia_provedor, cpf_confere, sgp_vinculo, ocorrencias, criado_em"
    )
    .eq("ticket_id", t.id)
    .order("versao", { ascending: false });
  const consultasCredito = (consultasCc ?? []).map((c) => ({
    id: c.id as string,
    versao: c.versao as number,
    nomeTitular: c.nome_titular as string | null,
    cpf: c.cpf as string | null,
    score: c.score as number | null,
    faixa: c.faixa as string | null,
    adiantamentoValor: c.adiantamento_valor === null ? null : Number(c.adiantamento_valor),
    protocolo: c.protocolo as string | null,
    consultaEm: c.consulta_em as string | null,
    pendenciasQtd: Number(c.pendencias_qtd ?? 0),
    pendenciasValor: Number(c.pendencias_valor ?? 0),
    pendenciaProvedor: Boolean(c.pendencia_provedor),
    cpfConfere: c.cpf_confere as boolean | null,
    sgpVinculo: c.sgp_vinculo as string | null,
    ocorrencias: ((c.ocorrencias ?? []) as {
      data: string | null; modalidade: string | null; valor: number | null;
      credor: string | null; categoria: string;
    }[]),
    criadoEm: c.criado_em as string,
  }));

  // feature flag da política de crédito: "monitoring" (atual — alerta e
  // registra, nunca trava) | "enforced" (futuro, só por decisão da gestão)
  const { data: cfgCredito } = await criarClienteAdmin()
    .from("integracoes_config")
    .select("config")
    .eq("sistema", "politica_credito")
    .maybeSingle();
  const modoCredito =
    ((cfgCredito?.config as Record<string, unknown>)?.modo as string) === "enforced"
      ? "enforced"
      : "monitoring";

  const fechado = t.etapa === "fechado";
  const reabrivel = podeReabrir(t, new Date().toISOString());
  const podeReatribuir = !ehAgenteCrm(usuario.perfil);
  const podeOperarCredito =
    (["gestor", "supervisor"].includes(usuario.perfil) || ehAgenteCrm(usuario.perfil)) &&
    usuario.perfil !== "direcao" &&
    (!fechado || t.desfecho === "convertido");

  // vizinhos na lista (mesma situação: abertos com abertos, fechados com fechados)
  const vizinho = (dir: "anterior" | "proximo") => {
    let q = supabase.from("tickets").select("id").limit(1);
    q = fechado ? q.eq("etapa", "fechado") : q.neq("etapa", "fechado");
    return dir === "anterior"
      ? q.gt("criado_em", t.criado_em).order("criado_em", { ascending: true })
      : q.lt("criado_em", t.criado_em).order("criado_em", { ascending: false });
  };
  const [{ data: ant }, { data: prox }] = await Promise.all([vizinho("anterior"), vizinho("proximo")]);
  const idAnterior = (ant?.[0]?.id as string | undefined) ?? null;
  const idProximo = (prox?.[0]?.id as string | undefined) ?? null;

  const digitos = (t.telefone ?? "").replace(/\D/g, "");
  const whatsapp = digitos.length >= 10 ? `https://wa.me/${(digitos.length <= 11 ? "55" : "") + digitos}` : null;
  const iniciais =
    t.cliente_nome
      .split(/\s+/)
      .filter((p) => p.length > 1)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?";
  const ultimaAtualizacao = t.eventos[0]?.criado_em ?? t.criado_em;
  const fonte =
    t.origem_criacao === "sz_auto" ? "WhatsApp / SZ Chat" : t.origem_criacao === "site" ? "Site (Contratar Online)" : "Cadastro manual";
  const status = fechado
    ? t.desfecho === "convertido"
      ? { rotulo: "Convertido", cor: "bg-farol-verde" }
      : { rotulo: t.fechado_por === "auto_inatividade" ? "Não convertido · inatividade" : "Não convertido", cor: "bg-farol-vermelho" }
    : { rotulo: "Em atendimento", cor: "bg-farol-verde" };

  const tabelaPropostas = (completa: boolean) =>
    t.propostas.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Package className="h-8 w-8 text-muted-foreground/70" strokeWidth={1.5} />
        <p className="text-sm font-semibold">Nenhuma proposta registrada.</p>
        {!fechado && (
          <p className="max-w-sm text-xs text-muted-foreground">
            Escolha o plano abaixo — o valor de tabela é sugerido automaticamente e pode ser ajustado para o valor negociado.
          </p>
        )}
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {t.propostas.map((p, i) => (
              <tr key={p.id} className={cn("border-b last:border-0", i === 0 ? "font-medium" : "text-muted-foreground")}>
                <td className="px-3 py-2">
                  {p.plano ?? p.descricao ?? "—"}
                  {p.velocidade && <span className="ml-1 text-xs text-muted-foreground">· {p.velocidade}</span>}
                  {i === 0 && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      atual
                    </Badge>
                  )}
                  {completa && (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {formatarData(p.criado_em.slice(0, 10))}
                      {p.usuario ? ` · ${p.usuario}` : ""}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatarMoeda(p.valor)}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.observacao ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const cabecalhoPropostas = (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)] bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      <span>Plano / produto</span>
      <span>Valor (R$)</span>
      <span>Observação</span>
    </div>
  );

  const historico = (
    <ol className="relative">
      {t.eventos.map((e, i) => (
        <li key={e.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[130px_18px_minmax(0,1fr)]">
          <span className="hidden pt-0.5 text-xs tabular-nums text-muted-foreground sm:block">{formatarDataHora(e.criado_em)}</span>
          <span className="relative flex justify-center">
            <span
              className={cn(
                "relative z-10 mt-1 h-3 w-3 rounded-full border-2",
                i === 0 ? "border-interlig-azul bg-interlig-azul ring-4 ring-sky-100" : "border-slate-300 bg-card"
              )}
            />
            {i < t.eventos.length - 1 && <span className="absolute bottom-0 top-4 w-px bg-border" />}
          </span>
          <div className="min-w-0 pb-4">
            <p className="text-[11px] tabular-nums text-muted-foreground sm:hidden">{formatarDataHora(e.criado_em)}</p>
            <p className="text-sm font-medium">
              {ROTULO_EVENTO[e.tipo] ?? e.tipo}
              {e.usuario && <span className="font-normal text-muted-foreground"> · {e.usuario}</span>}
            </p>
            {typeof e.dados.texto === "string" && <p className="text-sm text-muted-foreground">{e.dados.texto}</p>}
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
  );

  const preCadastro = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{visita ? "Visita externa 🚶" : "Pré-cadastro 📎"}</p>
          {visita ? (
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
              {visita.endereco_manual && (
                <>
                  {" · "}
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(visita.endereco_manual)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-interlig-ceu hover:underline"
                  >
                    🏠 {visita.endereco_manual}
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Prospecção sem visita registrada — inclua as fotos e o endereço fornecidos pelo cliente.
            </p>
          )}
        </div>
        {(visita || !fechado) && <AnexosVisita ticketId={t.id} />}
      </div>
      {visita && (
        <div className="flex flex-wrap gap-4">
          {fotoCasaUrl && (
            <a href={fotoCasaUrl} target="_blank" rel="noopener noreferrer" className="block">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Frente da casa</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoCasaUrl} alt="Frente da casa" className="h-44 w-64 max-w-full rounded-lg border object-cover" />
            </a>
          )}
          {fotoDocUrl ? (
            <a href={fotoDocUrl} target="_blank" rel="noopener noreferrer" className="block">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Documento (pré-cadastro)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoDocUrl} alt="Documento do cliente" className="h-44 w-64 max-w-full rounded-lg border object-cover" />
            </a>
          ) : (
            <div className="flex h-44 w-64 max-w-full flex-col items-center justify-center gap-1 self-end rounded-lg border border-dashed text-muted-foreground">
              <span className="text-xl">🪪</span>
              <p className="text-xs">Documento não anexado</p>
            </div>
          )}
          {fotoVersoUrl && (
            <a href={fotoVersoUrl} target="_blank" rel="noopener noreferrer" className="block">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Documento (verso)</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoVersoUrl} alt="Verso do documento" className="h-44 w-64 max-w-full rounded-lg border object-cover" />
            </a>
          )}
        </div>
      )}
    </div>
  );

  const atendimento = fechado ? (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>Ticket fechado é imutável — e não pode ser excluído por ninguém (PRD 3.9).</p>
      {reabrivel ? (
        <BotaoReabrir ticketId={t.id} />
      ) : (
        t.desfecho === "nao_convertido" && <p className="text-xs">Janela de reabertura (30 dias) expirada.</p>
      )}
    </div>
  ) : (
    <div className="space-y-5">
      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Phone className="h-5 w-5 text-interlig-azul" /> Registrar tratativa
        </h3>
        <div>
          <p className="mb-1.5 text-xs font-medium">Etapa do atendimento</p>
          <BarraEtapas ticketId={t.id} etapaAtual={t.etapa} />
        </div>
        <FormularioTratativa ticketId={t.id} />
      </div>
      <div className="grid gap-5 border-t pt-4 md:grid-cols-2 md:gap-0">
        <div className="md:pr-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-interlig-azul" /> Follow-up
          </p>
          <FormularioFollowup ticketId={t.id} atual={t.followup_em} />
          {t.followup_em && (
            <p className="mt-1.5 text-xs text-muted-foreground">Retorno combinado: {formatarData(t.followup_em.slice(0, 10))}</p>
          )}
        </div>
        <div className="md:border-l md:pl-5">
          <p className="mb-2 text-sm font-semibold">Ações agendadas ⏰</p>
          <AcoesAgendadas ticketId={t.id} acoes={(acoesAgendadas ?? []) as AcaoAgendada[]} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* migalha + navegação */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Caminho">
          <Link href="/crm" className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> CRM
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Ticket #{t.id.slice(0, 8)}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link href="/crm" className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium hover:bg-muted">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className="flex">
            {idAnterior ? (
              <Link href={`/crm/${idAnterior}`} title="Ticket anterior" className="inline-flex h-9 w-9 items-center justify-center rounded-l-md border bg-card hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-l-md border bg-card text-muted-foreground/40">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            {idProximo ? (
              <Link href={`/crm/${idProximo}`} title="Próximo ticket" className="-ml-px inline-flex h-9 w-9 items-center justify-center rounded-r-md border bg-card hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="-ml-px inline-flex h-9 w-9 items-center justify-center rounded-r-md border bg-card text-muted-foreground/40">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>
          <MenuOpcoes protocolo={t.sz_conversa_id} />
          <MaisAcoes ticketId={t.id} linkSgp={t.contrato_sgp_id ? linkSgp : null} whatsapp={whatsapp} reabrivel={fechado && reabrivel} />
        </div>
      </div>

      {/* identificação */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-interlig-azul text-xl font-bold text-white sm:h-16 sm:w-16 sm:text-2xl">
            {iniciais}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-extrabold tracking-tight sm:text-3xl">{t.cliente_nome}</h1>
              {!fechado && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-interlig-azul">{ROTULO_ETAPA[t.etapa]}</span>
              )}
              {t.origem_criacao === "sz_auto" && <span className="rounded-full border px-3 py-1 text-xs font-medium">via SZ Chat</span>}
              {t.origem_criacao === "site" && <span className="rounded-full border px-3 py-1 text-xs font-medium">via Site</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ticket aberto em {formatarDataHora(t.criado_em)}
              {t.sz_conversa_id && <> <span className="mx-1">•</span> Protocolo SZ: {t.sz_conversa_id}</>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-sm">
          <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full", status.cor)} />
          <div>
            <p className="text-sm font-semibold">{status.rotulo}</p>
            <p className="text-[11px] text-muted-foreground">Última atualização: {formatarDataHora(ultimaAtualizacao)}</p>
          </div>
        </div>
      </div>

      {t.resumo_tratativa && (
        <div
          className={cn(
            "rounded-xl border p-4",
            t.urgencia === "alta" ? "border-rose-300 bg-rose-50/60" : t.urgencia === "media" ? "border-amber-300 bg-amber-50/60" : "border-emerald-300 bg-emerald-50/60"
          )}
        >
          <p className="mb-1 flex items-center gap-2 text-sm font-bold">
            🔔 Follow-up pendente
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-black uppercase",
                t.urgencia === "alta" ? "bg-rose-500 text-white" : t.urgencia === "media" ? "bg-amber-400 text-amber-950" : "bg-emerald-500 text-white"
              )}
            >
              {t.urgencia === "alta" ? "Alta" : t.urgencia === "media" ? "Média" : "Baixa"}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">{t.resumo_tratativa}</p>
          {t.proxima_abordagem && <p className="mt-2 text-sm font-medium">➜ {t.proxima_abordagem}</p>}
          {t.urgencia !== null && (
            <div className="mt-3">
              <FollowupFeito ticketId={t.id} />
            </div>
          )}
        </div>
      )}

      {/* colunas: no celular viram uma lista só, na ordem de uso */}
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:items-start">
        <div className="contents xl:flex xl:flex-col xl:gap-4">
          {/* Dados do cliente */}
          <ModoEdicaoProvider>
            <Cartao className="order-1 xl:order-none" titulo="Dados do cliente" icone={<FileText className="h-5 w-5" />} acao={<BotaoEditarDados />}>
              <div className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
                <dl className="space-y-3">
                  <Campo icone={<Phone className="h-4 w-4" />}>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t.telefone ?? "—"}</span>
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir conversa no WhatsApp"
                          className="inline-flex items-center gap-1 rounded-full bg-farol-verde/15 px-2 py-0.5 text-[11px] font-medium text-farol-verde hover:underline"
                        >
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </a>
                      )}
                      {t.contrato_sgp_id && linkSgp && (
                        <a href={linkSgp} target="_blank" rel="noopener noreferrer" title="Abrir no SGP" className="text-interlig-azul">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <TelefoneTicket ticketId={t.id} telefone={t.telefone} />
                    </span>
                  </Campo>
                  <Campo icone={<Headset className="h-4 w-4" />} rotulo="Fonte">{fonte}</Campo>
                  <Campo icone={<IdCard className="h-4 w-4" />} rotulo="CPF"><CpfTicket ticketId={t.id} cpf={t.cpf} /></Campo>
                  <Campo icone={<Mail className="h-4 w-4" />} rotulo="E-mail"><EmailTicket ticketId={t.id} email={t.email ?? null} /></Campo>
                  {t.cliente_sgp_nome && (
                    <Campo icone={<UserCheck className="h-4 w-4" />} rotulo="Titular SGP">
                      <span className="font-medium">{t.cliente_sgp_nome}</span>
                    </Campo>
                  )}
                </dl>
                <dl className="space-y-3">
                  <Campo icone={<Gauge className="h-4 w-4" />} rotulo="Score">
                    <ScoreTicket
                      ticketId={t.id}
                      score={t.score}
                      faixa={t.score_faixa}
                      adiantamentoValor={t.adiantamento_valor}
                      recebidoEm={t.adiantamento_recebido_em}
                      podeEditar={false} // 01/10/2026: score manual desativado — só o PDF
                    />
                  </Campo>
                  <Campo icone={<User className="h-4 w-4" />} rotulo="Vendedora">{t.vendedora ?? "Não atribuído"}</Campo>
                  <Campo icone={<MapPin className="h-4 w-4" />} rotulo="POP">{t.pop ?? "—"}</Campo>
                  <Campo icone={<CalendarClock className="h-4 w-4" />} rotulo="Criado em">{formatarDataHora(t.criado_em)}</Campo>
                  <Campo icone={<Clock3 className="h-4 w-4" />} rotulo="1ª tratativa">
                    {t.primeira_tratativa_em ? formatarDataHora(t.primeira_tratativa_em) : "ainda não houve"}
                  </Campo>
                </dl>
              </div>
              <div className="mt-5 space-y-3">
                <ConsultaCredito
                  ticketId={t.id}
                  atual={consultasCredito[0] ?? null}
                  historico={consultasCredito}
                  adiantamentoRecebidoEm={t.adiantamento_recebido_em}
                  podeEditar={podeOperarCredito}
                />
                <FollowupIa
                  ticketId={t.id}
                  analise={t.analise_followup as never}
                  analisadoEm={t.followup_analisado_em}
                  temConversa={Boolean(t.sz_conversa_id)}
                />
              </div>
            </Cartao>
          </ModoEdicaoProvider>

          {/* trabalho do dia */}
          <section className="order-3 rounded-xl border bg-card shadow-sm xl:order-none">
            <AbasTicket
              abas={[
                { chave: "atendimento", rotulo: "Atendimento", icone: <MessageSquare className="h-4 w-4" />, conteudo: atendimento },
                { chave: "pre", rotulo: "Pré-cadastro", icone: <Paperclip className="h-4 w-4" />, conteudo: preCadastro },
                {
                  chave: "propostas",
                  rotulo: "Propostas / Produtos",
                  icone: <Package className="h-4 w-4" />,
                  conteudo: (
                    <div className="overflow-hidden rounded-lg border">
                      {cabecalhoPropostas}
                      {tabelaPropostas(true)}
                    </div>
                  ),
                },
                { chave: "historico", rotulo: "Histórico", icone: <Clock3 className="h-4 w-4" />, conteudo: historico },
              ]}
            />
          </section>
        </div>

        <div className="contents xl:flex xl:flex-col xl:gap-4">
          {/* desfecho */}
          <Cartao className="order-2 xl:order-none" titulo={fechado ? "Ticket fechado" : "Desfecho do ticket"} icone={<Trophy className="h-5 w-5" />}>
            {fechado ? (
              <div className="space-y-2 text-sm">
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg border-2 px-4 py-3",
                    t.desfecho === "convertido" ? "border-farol-verde/40 bg-farol-verde/10" : "border-farol-vermelho/40 bg-farol-vermelho/10"
                  )}
                >
                  {t.desfecho === "convertido" ? (
                    <CheckCircle2 className="h-9 w-9 shrink-0 fill-farol-verde text-white" />
                  ) : (
                    <XCircle className="h-9 w-9 shrink-0 fill-farol-vermelho text-white" />
                  )}
                  <div>
                    <p className={cn("font-semibold", t.desfecho === "convertido" ? "text-farol-verde" : "text-farol-vermelho")}>{status.rotulo}</p>
                    <p className="text-xs text-muted-foreground">Fechado em {formatarDataHora(t.fechado_em)}</p>
                  </div>
                </div>
                {t.desfecho === "convertido" ? (
                  <dl className="space-y-1.5 pt-1">
                    <p><span className="text-muted-foreground">Plano vendido:</span> {t.plano ?? "—"}</p>
                    <p><span className="text-muted-foreground">Origem:</span> {t.origem_cadastro ? ROTULO_ORIGEM[t.origem_cadastro] : "—"}</p>
                    <p>
                      <span className="text-muted-foreground">Contrato SGP:</span>{" "}
                      {t.contrato_id ? (
                        t.contrato_sgp_id && linkSgp ? (
                          <a href={linkSgp} target="_blank" rel="noopener noreferrer" className="font-mono text-interlig-ceu hover:underline" title="Abrir contrato no SGP">
                            #{t.contrato_sgp_id} ↗
                          </a>
                        ) : (
                          <Badge variant="verde">reconciliado</Badge>
                        )
                      ) : (
                        <Badge variant="amarelo">aguardando reconciliação</Badge>
                      )}
                    </p>
                  </dl>
                ) : (
                  <p className="pt-1"><span className="text-muted-foreground">Motivo:</span> {t.motivo ?? "—"}</p>
                )}
              </div>
            ) : (
              <FormularioFechamento
                ticketId={t.id}
                telefone={t.telefone}
                cpf={t.cpf}
                planos={planosPermitidos}
                motivos={motivos ?? []}
                scoreFaixa={t.score_faixa}
                adiantamentoValor={t.adiantamento_valor}
                adiantamentoRecebido={Boolean(t.adiantamento_recebido_em)}
                modoCredito={modoCredito}
              />
            )}
          </Cartao>

          {/* propostas */}
          <Cartao
            className="order-4 xl:order-none"
            titulo="Propostas / Produtos"
            icone={<Package className="h-5 w-5" />}
            acao={
              !fechado ? (
                <label
                  htmlFor="proposta_plano_id"
                  className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border border-interlig-azul/40 px-3 text-xs font-semibold text-interlig-azul hover:bg-sky-50"
                >
                  <Plus className="h-4 w-4" /> Nova proposta
                </label>
              ) : t.propostas.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Negociação: <strong className="text-interlig-azul">{formatarMoeda(t.valor_estimado ?? t.propostas[0].valor)}</strong>
                </span>
              ) : null
            }
          >
            <div className="overflow-hidden rounded-lg border">
              {cabecalhoPropostas}
              {tabelaPropostas(false)}
            </div>
            {!fechado && (
              <div className="mt-4 rounded-lg border p-4">
                <FormularioProposta ticketId={t.id} planos={planosPermitidos} />
              </div>
            )}
          </Cartao>

          {!fechado && podeReatribuir && (
            <Cartao className="order-5 xl:order-none" titulo="Reatribuir ticket" icone={<UserCog className="h-5 w-5" />}>
              <FormularioReatribuir ticketId={t.id} vendedoras={vendedoras ?? []} atualId={t.vendedor_id} />
            </Cartao>
          )}

          {/* Exclusão administrativa — só o Administrador (limpeza/testes) */}
          {usuario.perfil === "gestor" && (
            <Cartao className="order-6 xl:order-none" titulo="Administração" icone={<Settings className="h-5 w-5" />}>
              <BotaoExcluir ticketId={t.id} cliente={t.cliente_nome} />
            </Cartao>
          )}
        </div>
      </div>

      {/* histórico completo */}
      <Cartao titulo={`Histórico (${t.eventos.length})`} icone={<Clock3 className="h-5 w-5" />}>
        {historico}
      </Cartao>
    </div>
  );
}

function Cartao({
  titulo,
  icone,
  acao,
  className,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold sm:text-lg">
          <span className="text-interlig-azul">{icone}</span>
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Campo({ icone, rotulo, children }: { icone: React.ReactNode; rotulo?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid items-start gap-x-3", rotulo ? "grid-cols-[18px_88px_minmax(0,1fr)]" : "grid-cols-[18px_minmax(0,1fr)]")}>
      <span className="mt-0.5 text-muted-foreground">{icone}</span>
      {rotulo && <dt className="text-muted-foreground">{rotulo}</dt>}
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
