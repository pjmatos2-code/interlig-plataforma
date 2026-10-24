import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ShieldCheck } from "lucide-react";
import { FormRevisao } from "@/components/performance/acoes-ia";
import { fmtDataHora, fmtDuracao } from "@/components/performance/formato";
import { NotaScore, Painel, Vazio } from "@/components/performance/ui";
import { cn } from "@/lib/utils";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { alcanca, exigirEscopo } from "@/lib/performance/escopo";
import { ROTULO_CRITERIO, ROTULO_OBJECAO, ROTULO_OPORTUNIDADE, type Criterio } from "@/lib/performance/ia/schema";
import { criarOcultador, nomesInformadosNaConversa } from "@/lib/performance/mascara";

export const dynamic = "force-dynamic";

const ROTULO_AUTOR = { cliente: "Cliente", agente: "Vendedor", automacao: "Automação", sistema: "Sistema" } as const;

type Analise = {
  resumo: string;
  temperatura: string;
  intencao_compra: boolean;
  sinais_intencao: string[];
  objecoes: string[];
  status_lead: string;
  onde_parou: string;
  interesse_principal: string | null;
  plano_interesse: string | null;
  necessidade: string | null;
  estagio_estimado: string;
  proximo_passo: string;
  prioridade: string;
  probabilidade_fechamento: string;
  confianca: number;
  evidencias: { mensagem: number; motivo: string; mensagem_id?: string | null }[];
  qualidade_atendimento: { criterio: string; nota: number | null; justificativa: string }[];
  oportunidade_esquecida: { tipo: string; descricao: string } | null;
  followup_sugerido: { em_dias_uteis: number; acao: string; motivo: string } | null;
};

export default async function DetalheConversa({ params }: { params: { id: string } }) {
  const escopo = await exigirEscopo();
  const admin = criarClienteAdmin();
  const { data: c } = await admin
    .from("conversas_atendimento")
    .select("id, protocolo, ticket_id, vendedor_id, agente_nome, equipe, canal, iniciada_em, iniciada_por, finalizada_em, primeira_resposta_seg, primeira_resposta_util_seg, cliente_sem_resposta, transferencias, msgs_cliente, msgs_agente, msgs_automacao, status_final")
    .eq("id", params.id)
    .maybeSingle();
  if (!c || !escopo.podeVerConversas || !alcanca(escopo, c.vendedor_id as string | null)) notFound();
  // acesso a conteúdo sensível fica registrado (LGPD)
  await admin.from("auditoria_performance").insert({ usuario_id: escopo.usuario.id, acao: "ver_conversa", alvo: c.id });

  const [{ data: msgs }, { data: analises }, { data: tk }, { data: bairros }] = await Promise.all([
    admin.from("conversas_mensagens").select("externo_id, autor, agente_nome, enviada_em, texto, tipo, tamanho").eq("conversa_id", c.id).order("ordem").limit(2000),
    admin.from("analises_conversa").select("id, versao, modelo, concluido_em, resultado, score_atendimento, temperatura, status_lead, revisao, revisado_em").eq("conversa_id", c.id).eq("status", "concluida").order("concluido_em", { ascending: false }).limit(1),
    c.ticket_id ? admin.from("tickets").select("cliente_nome").eq("id", c.ticket_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("bairros_geo").select("bairro"),
  ]);
  // o que escapou da máscara da coleta: nome do cliente do lead (palavra a palavra) e bairros
  const ocultar = criarOcultador([
    ...String((tk as { cliente_nome?: string } | null)?.cliente_nome ?? "").split(/\s+/),
    ...nomesInformadosNaConversa((msgs ?? []).map((m) => ({ autor: m.autor as string, texto: (m.texto as string | null) ?? null }))),
    ...(bairros ?? []).map((b) => String(b.bairro ?? "").replace(/^bairro\s+/i, "")),
  ]);
  const an = analises?.[0];
  const r = (an?.resultado ?? null) as Analise | null;
  const evidencias = new Map((r?.evidencias ?? []).filter((e) => e.mensagem_id).map((e) => [e.mensagem_id as string, e.motivo]));
  const revisao = (an?.revisao ?? null) as { temperatura?: string; status_lead?: string; score?: number; comentario?: string } | null;
  const podeRevisar = escopo.papel === "admin" || escopo.papel === "supervisor" || escopo.papel === "gerente_unidade";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/performance/conversas" className="text-sm text-interlig-azul hover:underline">← Inteligência das conversas</Link>
        {c.ticket_id && <Link href={`/crm/${c.ticket_id}`} className="text-sm font-medium text-interlig-azul hover:underline">Abrir lead no CRM</Link>}
      </div>
      <section className="mb-4 rounded-xl border bg-card p-4 text-sm shadow-sm">
        <p className="font-semibold">{c.equipe ?? "Conversa"} · protocolo {c.protocolo ?? "—"}</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{fmtDataHora(c.iniciada_em as string)} → {fmtDataHora(c.finalizada_em as string)}</span>
          <span>atendente principal: {(c.agente_nome as string) ?? "—"}</span>
          <span>{c.iniciada_por === "agente" ? "contato ativo (iniciado pelo vendedor)" : "receptivo"}</span>
          <span>1ª resposta: {fmtDuracao(c.primeira_resposta_util_seg as number | null)} no expediente ({fmtDuracao(c.primeira_resposta_seg as number | null)} corridos)</span>
          <span>{c.msgs_cliente as number} msgs do cliente · {c.msgs_agente as number} humanas · {c.msgs_automacao as number} da automação</span>
          {(c.transferencias as number) > 0 && <span>{c.transferencias as number} transferência(s)</span>}
          {c.cliente_sem_resposta && <span className="font-medium text-farol-vermelho">terminou com o cliente sem resposta</span>}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Painel titulo="Conversa (dados pessoais mascarados)" descricao="CPF, telefone, e-mail, CEP e localização são mascarados na coleta; nome do cliente e bairros aparecem como [omitido]. Mensagens em azul são as evidências usadas pela IA.">
          {!msgs?.length ? (
            <Vazio>Sem mensagens.</Vazio>
          ) : (
            <ol className="max-h-[70vh] space-y-1.5 overflow-auto pr-1 text-sm">
              {msgs.map((m, i) => {
                const motivo = evidencias.get(m.externo_id as string);
                const autor = m.autor as keyof typeof ROTULO_AUTOR;
                return (
                  <li
                    key={m.externo_id as string}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5",
                      autor === "cliente" && "bg-muted/40",
                      autor === "automacao" || autor === "sistema" ? "border-dashed text-muted-foreground" : "",
                      motivo && "border-interlig-ceu bg-interlig-ceu/5"
                    )}
                  >
                    <p className="text-[11px] text-muted-foreground">
                      [{i + 1}] {ROTULO_AUTOR[autor]}{autor === "agente" && m.agente_nome ? ` · ${String(m.agente_nome).split(" ")[0]}` : ""} · {fmtDataHora(m.enviada_em as string)}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{m.texto ? ocultar(m.texto as string) : m.tipo && m.tipo !== "text" ? `[${m.tipo}]` : <span className="italic text-muted-foreground">texto expirado pela retenção</span>}</p>
                    {motivo && <p className="mt-0.5 text-[11px] font-medium text-interlig-azul">evidência: {motivo}</p>}
                  </li>
                );
              })}
            </ol>
          )}
        </Painel>

        <div className="space-y-4">
          {!r ? (
            <Painel titulo="Análise da IA">
              <Vazio>Esta conversa ainda não foi analisada.</Vazio>
            </Painel>
          ) : (
            <Painel
              titulo="Análise da IA"
              descricao={`Inferência automática (${an!.modelo ?? "IA"}, versão ${an!.versao}, ${fmtDataHora(an!.concluido_em as string)}). Confiança ${Math.round(r.confianca * 100)}%. Apoio à gestão — confirme antes de agir.`}
              acao={<Bot className="h-4 w-4 text-muted-foreground" aria-label="Inferência da IA" />}
            >
              <p className="text-sm">{r.resumo}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Temperatura", r.temperatura],
                  ["Intenção de compra", r.intencao_compra ? "sim" : "não"],
                  ["Situação do lead", r.status_lead],
                  ["Onde parou", r.onde_parou.replace(/_/g, " ")],
                  ["Estágio estimado", r.estagio_estimado],
                  ["Probabilidade (qualitativa)", r.probabilidade_fechamento],
                  ["Plano de interesse", r.plano_interesse ?? "—"],
                  ["Prioridade", r.prioridade],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted/40 p-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {r.objecoes.length > 0 && <p className="mt-3 text-xs"><span className="text-muted-foreground">Objeções: </span>{r.objecoes.map((o) => ROTULO_OBJECAO[o as keyof typeof ROTULO_OBJECAO] ?? o).join(", ")}</p>}
              {r.sinais_intencao.length > 0 && <p className="mt-1 text-xs"><span className="text-muted-foreground">Sinais de intenção: </span>{r.sinais_intencao.join(" · ")}</p>}
              <p className="mt-3 rounded-md border border-interlig-ceu/30 bg-interlig-ceu/5 p-2 text-sm"><span className="font-medium">Próximo passo recomendado: </span>{r.proximo_passo}</p>
              {r.oportunidade_esquecida && (
                <p className="mt-2 rounded-md border border-farol-amarelo/40 bg-farol-amarelo/10 p-2 text-sm">
                  <span className="font-medium">{ROTULO_OPORTUNIDADE[r.oportunidade_esquecida.tipo as keyof typeof ROTULO_OPORTUNIDADE] ?? "Oportunidade"}: </span>
                  {r.oportunidade_esquecida.descricao}
                </p>
              )}
            </Painel>
          )}

          {r && r.qualidade_atendimento.length > 0 && (
            <Painel titulo="Qualidade do atendimento" descricao="Rubrica configurável; só as falas do vendedor humano são avaliadas." acao={<NotaScore valor={an!.score_atendimento as number | null} />}>
              <ul className="divide-y text-sm">
                {r.qualidade_atendimento.map((q) => (
                  <li key={q.criterio} className="flex items-start justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      {ROTULO_CRITERIO[q.criterio as Criterio] ?? q.criterio}
                      <span className="block text-xs text-muted-foreground">{q.justificativa}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums">{q.nota === null ? "não se aplica" : `${q.nota}/10`}</span>
                  </li>
                ))}
              </ul>
            </Painel>
          )}

          {r && (
            <Painel titulo="Revisão humana" descricao="A classificação da IA fica preservada; a revisão passa a valer nos indicadores." acao={<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />}>
              {revisao && (
                <p className="mb-2 rounded-md bg-muted/50 p-2 text-xs">
                  Revisada em {fmtDataHora(an!.revisado_em as string)}: {revisao.temperatura ?? "—"} · {revisao.status_lead ?? "—"} · nota {revisao.score ?? "—"} — “{revisao.comentario}”
                </p>
              )}
              {podeRevisar ? <FormRevisao id={an!.id as string} temperatura={(revisao?.temperatura ?? an!.temperatura) as string | null} statusLead={(revisao?.status_lead ?? an!.status_lead) as string | null} score={(revisao?.score ?? an!.score_atendimento) as number | null} /> : <p className="text-xs text-muted-foreground">Seu perfil só consulta.</p>}
            </Painel>
          )}
        </div>
      </div>
    </div>
  );
}
