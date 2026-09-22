"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmarAdiantamentoTicket,
  urlConsultaCredito,
  solicitarRevisaoScore,
} from "@/app/(app)/crm/acoes";

/**
 * Painel "Consulta de crédito" (Consult Center, 21/09/2026).
 *
 * Fase MONITORAMENTO: o PDF anexado alimenta score/faixa/adiantamento e o
 * painel alerta e registra — nenhuma ação daqui bloqueia a venda. As cores
 * são classificação INTERNA: a orientação copiável para o cliente nunca
 * menciona faixa, score ou dívida.
 */

export type ConsultaResumo = {
  id: string;
  versao: number;
  nomeTitular: string | null;
  cpf: string | null;
  score: number | null;
  faixa: string | null;
  adiantamentoValor: number | null;
  protocolo: string | null;
  consultaEm: string | null;
  pendenciasQtd: number;
  pendenciasValor: number;
  pendenciaProvedor: boolean;
  cpfConfere: boolean | null;
  sgpVinculo: string | null;
  criadoEm: string;
};

const FAIXA_UI: Record<string, { rotulo: string; cls: string }> = {
  verde: { rotulo: "🟢 VERDE", cls: "bg-emerald-100 text-emerald-800" },
  amarelo: { rotulo: "🟡 AMARELO", cls: "bg-amber-100 text-amber-900" },
  vermelho: { rotulo: "🔴 VERMELHO", cls: "bg-rose-100 text-rose-800" },
};

const ORIENTACAO: Record<string, string> = {
  verde:
    "Sua instalação continua grátis e não há necessidade de adiantamento. Seguimos com o faturamento normal conforme o período de uso e o ciclo contratado.",
  amarelo:
    "Sua instalação continua grátis. Para esta contratação, a condição de pagamento prevê uma antecipação de R$ 49 da mensalidade. Todo o valor será abatido das suas faturas, começando pela primeira. Se a primeira fatura for menor, o restante fica como crédito para a próxima. Se for maior, você paga somente a diferença.",
  vermelho:
    "Sua instalação continua grátis. Para esta contratação, a condição de pagamento prevê uma antecipação de R$ 100 da mensalidade. Todo o valor será abatido das suas faturas, começando pela primeira. Se a primeira fatura for menor, o restante fica como crédito para a próxima. Se for maior, você paga somente a diferença.",
};

const mascararNome = (nome: string | null): string =>
  nome
    ? nome
        .split(/\s+/)
        .map((p) => (p.length <= 2 ? p : p[0] + "*".repeat(Math.min(p.length - 1, 9))))
        .join(" ")
    : "—";

const mascararCpf = (cpf: string | null): string =>
  cpf && cpf.length === 11 ? `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**` : "—";

const moeda = (v: number | null | undefined) =>
  `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        timeZone: "America/Santarem",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

export function ConsultaCredito({
  ticketId,
  atual,
  historico,
  adiantamentoRecebidoEm,
  podeEditar,
}: {
  ticketId: string;
  atual: ConsultaResumo | null;
  historico: ConsultaResumo[];
  adiantamentoRecebidoEm: string | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, comecar] = useTransition();

  const enviar = async (arquivo: File) => {
    setErro(null);
    setMsg("Processando consulta...");
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set("ticket_id", ticketId);
      corpo.set("arquivo", arquivo);
      const r = await fetch("/api/crm/consulta-credito", { method: "POST", body: corpo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.erro) {
        setMsg(null);
        setErro(j.erro ?? "Falha ao processar o PDF.");
      } else {
        setMsg("Consulta processada.");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      }
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const ui = atual?.faixa ? FAIXA_UI[atual.faixa] : null;
  const precisaAdiantamento = (atual?.adiantamentoValor ?? 0) > 0;
  const statusPagamento = !atual
    ? null
    : !precisaAdiantamento && atual.score !== null
      ? "Não exigido"
      : adiantamentoRecebidoEm
        ? "Pagamento confirmado"
        : atual.score === null
          ? "Necessita conferência"
          : "Aguardando pagamento";

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Consulta de crédito</h3>
        {podeEditar && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviar(f);
              }}
            />
            <button
              type="button"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
              className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              {atual ? "Anexar nova consulta" : "Anexar consulta Consult Center"}
            </button>
          </>
        )}
      </div>

      {msg && <p className="text-xs font-medium text-emerald-700">{msg}</p>}
      {erro && <p className="text-xs text-destructive">{erro}</p>}

      {!atual && (
        <p className="text-xs text-muted-foreground">
          Anexe o relatório completo em PDF da Consult Center — a plataforma extrai o score,
          confere o titular e enquadra na faixa automaticamente.
        </p>
      )}

      {atual && (
        <>
          {/* destaque da condição — cores são classificação interna */}
          {atual.score === null ? (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">
              Score não identificado. Consulta requer conferência.
            </div>
          ) : (
            ui && (
              <div
                className={`rounded-md px-3 py-2 ${
                  atual.faixa === "verde" ? "bg-emerald-50" : atual.faixa === "amarelo" ? "bg-amber-50" : "bg-rose-50"
                }`}
              >
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ui.cls}`}>{ui.rotulo}</span>
                  <span className="font-semibold tabular-nums">score {atual.score}</span>
                </p>
                {precisaAdiantamento ? (
                  <p className="mt-1 text-sm font-semibold">
                    {moeda(atual.adiantamentoValor)} — ADIANTAMENTO DE FATURA RECOMENDADO
                    <span className="block text-xs font-normal text-muted-foreground">
                      Instalação grátis. O valor antecipado será abatido integralmente das faturas.
                      {!adiantamentoRecebidoEm && " Pagamento ainda não confirmado."}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Não há necessidade de adiantamento de fatura. Instalação grátis.
                  </p>
                )}
              </div>
            )
          )}

          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Titular</dt><dd className="font-medium">{mascararNome(atual.nomeTitular)}</dd></div>
            <div><dt className="text-muted-foreground">CPF</dt><dd className="font-medium tabular-nums">{mascararCpf(atual.cpf)}</dd></div>
            <div><dt className="text-muted-foreground">Consulta</dt><dd>{dataHora(atual.consultaEm)}</dd></div>
            <div><dt className="text-muted-foreground">Protocolo</dt><dd className="tabular-nums">{atual.protocolo ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Pendências</dt><dd>{atual.pendenciasQtd > 0 ? `${atual.pendenciasQtd} · ${moeda(atual.pendenciasValor)}` : "nenhuma"}</dd></div>
            <div><dt className="text-muted-foreground">Status</dt><dd className={statusPagamento === "Pagamento confirmado" ? "font-medium text-emerald-700" : precisaAdiantamento ? "font-medium text-amber-700" : ""}>{statusPagamento}</dd></div>
          </dl>

          {/* alertas */}
          <div className="space-y-1">
            {atual.cpfConfere === false && (
              <p className="rounded-md bg-rose-100 px-2 py-1.5 text-xs font-semibold text-rose-800">
                ⚠ Divergência de titular. O CPF da consulta não corresponde ao CPF informado no
                ticket. O titular não foi alterado — confira antes de seguir.
              </p>
            )}
            {atual.cpfConfere === true && (
              <p className="text-xs text-emerald-700">✓ CPF compatível com o titular informado.</p>
            )}
            {atual.sgpVinculo === "pendente" && (
              <p className="text-xs text-muted-foreground">Vínculo SGP pendente (cliente ainda não cadastrado).</p>
            )}
            {atual.pendenciaProvedor && (
              <p className="rounded-md bg-amber-100 px-2 py-1.5 text-xs font-medium text-amber-900">
                Pendência registrada com provedor de internet.
              </p>
            )}
            {precisaAdiantamento && !adiantamentoRecebidoEm && (
              <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">
                ⚠ ADIANTAMENTO PENDENTE — condição recomendada: {moeda(atual.adiantamentoValor)} de
                adiantamento de fatura. A instalação continua grátis. Pagamento ainda não confirmado.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Dados extraídos do relatório Consult Center.</p>
          </div>

          {/* ações */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                comecar(async () => {
                  const r = await urlConsultaCredito(atual.id);
                  if (r.url) window.open(r.url, "_blank", "noopener");
                  else setErro(r.erro ?? "Falha ao abrir o PDF.");
                })
              }
              disabled={pendente}
              className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
            >
              Visualizar consulta
            </button>
            {atual.faixa && (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(ORIENTACAO[atual.faixa!] ?? "");
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2500);
                }}
                className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {copiado ? "✓ Copiado" : "Copiar orientação ao cliente"}
              </button>
            )}
            {podeEditar && precisaAdiantamento && !adiantamentoRecebidoEm && (
              <button
                type="button"
                disabled={pendente}
                onClick={() =>
                  comecar(async () => {
                    const r = await confirmarAdiantamentoTicket(ticketId);
                    if (r.erro) setErro(r.erro);
                    else router.refresh();
                  })
                }
                className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                Confirmar recebimento
              </button>
            )}
            {podeEditar && (
              <button
                type="button"
                onClick={() => {
                  const motivo = window.prompt("Motivo da revisão do score (vai para a gestão):");
                  if (motivo)
                    comecar(async () => {
                      const r = await solicitarRevisaoScore(ticketId, motivo);
                      if (r.erro) setErro(r.erro);
                      else router.refresh();
                    });
                }}
                className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Solicitar revisão
              </button>
            )}
          </div>

          {historico.length > 1 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Histórico ({historico.length} consultas)
              </summary>
              <ul className="mt-1 space-y-1">
                {historico.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">v{h.versao}</span>
                    <span>{h.score !== null ? `score ${h.score} (${h.faixa})` : "score não identificado"}</span>
                    <span className="text-muted-foreground">{dataHora(h.criadoEm)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        comecar(async () => {
                          const r = await urlConsultaCredito(h.id);
                          if (r.url) window.open(r.url, "_blank", "noopener");
                        })
                      }
                      className="text-primary hover:underline"
                    >
                      abrir PDF
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
