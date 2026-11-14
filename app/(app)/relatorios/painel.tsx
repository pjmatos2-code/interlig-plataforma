"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Mail, RefreshCw } from "lucide-react";
import { gerarRelatorioAgora, reescreverTextosAgora, salvarEnvioRelatorio } from "./acoes";

export function GerarRelatorio({ semanas }: { semanas: { inicio: string; rotulo: string; existe: boolean }[] }) {
  const [semana, setSemana] = useState(semanas[0]?.inicio ?? "");
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; aviso?: string } | null>(null);
  const router = useRouter();
  const gerar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await gerarRelatorioAgora(semana);
      if (r.erro) return setMsg({ erro: r.erro });
      if (r.aviso) setMsg({ aviso: r.aviso });
      if (r.id) router.push(`/relatorios/semanal/${r.id}`);
    });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="semana">Semana</label>
        <select
          id="semana"
          value={semana}
          disabled={pendente}
          onChange={(e) => setSemana(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:w-72"
        >
          {semanas.map((s) => (
            <option key={s.inicio} value={s.inicio}>
              {s.rotulo}
              {s.existe ? " · já gerado" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={gerar}
          disabled={pendente || !semana}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
        >
          <FileText className={`h-4 w-4 ${pendente ? "animate-pulse" : ""}`} />
          {pendente ? "Lendo os números e escrevendo (até 3 min)…" : "Gerar relatório"}
        </button>
      </div>
      {msg?.erro && <p className="text-sm text-farol-vermelho">{msg.erro}</p>}
      {msg?.aviso && <p className="text-sm text-amber-700">{msg.aviso}</p>}
    </div>
  );
}

export function ReescreverTextos({ id }: { id: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await reescreverTextosAgora(id);
            setErro(r.erro ?? null);
            router.refresh();
          })
        }
        className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pendente ? "animate-spin" : ""}`} />
        {pendente ? "Escrevendo…" : "Reescrever textos"}
      </button>
      {erro && <span className="text-xs text-farol-vermelho">{erro}</span>}
    </div>
  );
}

const campo = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** para quem vai o e-mail, abertura e o envio automático de segunda */
export function ConfigEnvio({ inicial }: { inicial: { para: string; saudacao: string; automatico: boolean } }) {
  const [para, setPara] = useState(inicial.para);
  const [saudacao, setSaudacao] = useState(inicial.saudacao);
  const [automatico, setAutomatico] = useState(inicial.automatico);
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const salvar = () =>
    iniciar(async () => {
      setMsg(null);
      const r = await salvarEnvioRelatorio({ para, saudacao, automatico });
      setMsg(r.erro ? { erro: r.erro } : { ok: "Envio salvo." });
    });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
        Para (e-mails separados por vírgula)
        <input className={campo} type="text" inputMode="email" value={para} onChange={(e) => setPara(e.target.value)} placeholder="estevam@interlig.com" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        Nome na abertura do e-mail
        <input className={campo} type="text" value={saudacao} onChange={(e) => setSaudacao(e.target.value)} placeholder="Estevam" maxLength={40} />
      </label>
      <label className="flex items-start gap-2.5 self-end rounded-md border px-3 py-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#043792]" checked={automatico} onChange={(e) => setAutomatico(e.target.checked)} />
        <span>
          Enviar sozinho toda segunda às 8h
          <span className="block text-xs text-muted-foreground">Gera o relatório da semana que terminou no domingo e manda para os e-mails acima.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="inline-flex h-10 items-center justify-center rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar envio"}
        </button>
        {msg?.erro && <p className="text-sm text-farol-vermelho">{msg.erro}</p>}
        {msg?.ok && <p className="text-sm text-farol-verde">{msg.ok}</p>}
      </div>
    </div>
  );
}

/** "Enviar por e-mail" de um relatório: confirma os destinatários e manda agora */
export function EnviarRelatorio({ id, paraPadrao, pronto }: { id: string; paraPadrao: string; pronto: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [para, setPara] = useState(paraPadrao);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const router = useRouter();
  const enviar = async () => {
    setEnviando(true);
    setMsg(null);
    try {
      const resp = await fetch(`/api/relatorios/semanal/${id}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ para }),
      });
      const r = (await resp.json().catch(() => ({}))) as { erro?: string; para?: string[]; aviso?: string | null };
      if (!resp.ok || r.erro) setMsg({ erro: r.erro ?? `O envio falhou (HTTP ${resp.status}).` });
      else {
        setMsg({ ok: `Enviado para ${(r.para ?? []).join(", ")}${r.aviso ? ` (${r.aviso})` : ", com o PDF em anexo"}.` });
        setAberto(false);
      }
      router.refresh();
    } catch {
      setMsg({ erro: "Sem resposta do servidor. Confira a conexão e tente de novo." });
    } finally {
      setEnviando(false);
    }
  };
  if (!pronto) return null;
  return (
    <div className={aberto || msg ? "flex w-full flex-col gap-2 sm:w-auto" : "flex flex-col gap-2"}>
      {!aberto ? (
        <button
          type="button"
          onClick={() => { setAberto(true); setMsg(null); }}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
        >
          <Mail className="h-3.5 w-3.5" /> Enviar por e-mail
        </button>
      ) : (
        <div className="flex w-full flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:w-[26rem]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Para (e-mails separados por vírgula)
            <input className={campo} type="text" inputMode="email" value={para} onChange={(e) => setPara(e.target.value)} disabled={enviando} placeholder="estevam@interlig.com" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || !para.trim()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-interlig-azul px-3 text-sm font-semibold text-white hover:bg-interlig-azul/90 disabled:opacity-60"
            >
              <Mail className={`h-3.5 w-3.5 ${enviando ? "animate-pulse" : ""}`} />
              {enviando ? "Gerando o PDF e enviando…" : "Enviar agora"}
            </button>
            <button type="button" onClick={() => setAberto(false)} disabled={enviando} className="h-9 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {msg?.erro && <p className="text-xs text-farol-vermelho">{msg.erro}</p>}
      {msg?.ok && <p className="text-xs text-farol-verde">{msg.ok}</p>}
    </div>
  );
}
