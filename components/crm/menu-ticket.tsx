"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, ExternalLink, MessageCircle, MoreHorizontal, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { atualizarTicketDoSgp, reabrirTicket, type ResumoSgp } from "@/app/(app)/crm/acoes";
import { cn } from "@/lib/utils";

function useFora(aberto: boolean, fechar: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", esc); };
  }, [aberto, fechar]);
  return ref;
}

const ITEM = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50";

/** "Mais ações" do cabeçalho do ticket: SGP, WhatsApp e reabertura. */
export function MaisAcoes({
  ticketId,
  linkSgp,
  whatsapp,
  reabrivel,
}: {
  ticketId: string;
  linkSgp: string | null;
  whatsapp: string | null;
  reabrivel: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoSgp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useFora(aberto, () => setAberto(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-expanded={aberto}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-interlig-azul px-4 text-sm font-semibold text-white shadow-sm hover:bg-interlig-azul/90"
      >
        Mais ações <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border bg-card p-1.5 shadow-lg">
          <button
            type="button"
            className={ITEM}
            disabled={ocupado !== null}
            onClick={async () => {
              setOcupado("sgp");
              const r = await atualizarTicketDoSgp(ticketId);
              setResumo(r);
              setOcupado(null);
              setAberto(false);
              if (!r.erro) router.refresh();
            }}
          >
            <RefreshCw className={cn("h-4 w-4 text-interlig-azul", ocupado === "sgp" && "animate-spin")} />
            {ocupado === "sgp" ? "Consultando o SGP…" : "Atualizar do SGP"}
          </button>
          {linkSgp && (
            <a href={linkSgp} target="_blank" rel="noopener noreferrer" className={ITEM} onClick={() => setAberto(false)}>
              <ExternalLink className="h-4 w-4 text-interlig-azul" /> Abrir contrato no SGP
            </a>
          )}
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={ITEM} onClick={() => setAberto(false)}>
              <MessageCircle className="h-4 w-4 text-farol-verde" /> Conversar no WhatsApp
            </a>
          )}
          {reabrivel && (
            <button
              type="button"
              className={ITEM}
              disabled={ocupado !== null}
              onClick={async () => {
                setOcupado("reabrir");
                const r = await reabrirTicket(ticketId);
                setErro(r.erro ?? null);
                setOcupado(null);
                setAberto(false);
                router.refresh();
              }}
            >
              <RotateCcw className="h-4 w-4 text-interlig-azul" /> {ocupado === "reabrir" ? "Reabrindo…" : "Reabrir ticket"}
            </button>
          )}
        </div>
      )}
      {(resumo || erro) && (
        <div className="absolute right-0 z-20 mt-1.5 w-72 rounded-lg border bg-card p-3 text-xs shadow-md">
          {erro && <p className="text-destructive">{erro}</p>}
          {resumo?.erro && <p className="text-destructive">{resumo.erro}</p>}
          {resumo && !resumo.erro && (
            <p className="text-muted-foreground">
              SGP: serviço <span className="font-semibold text-foreground">{resumo.statusSgp}</span> · Termo{" "}
              {resumo.termoAssinado ? "✓" : "✗"} · Fidelidade {resumo.fidelidadeAssinada ? "✓" : "✗"}
              {resumo.osAbertas && resumo.osAbertas.length > 0 && (
                <>
                  {" "}· OS {resumo.osAbertas[0].protocolo ?? "aberta"}
                  {resumo.osAbertas[0].agendamento
                    ? ` agendada ${new Date(resumo.osAbertas[0].agendamento).toLocaleString("pt-BR", { timeZone: "America/Santarem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : " sem agendamento"}
                </>
              )}
            </p>
          )}
          <button type="button" onClick={() => { setResumo(null); setErro(null); }} className="mt-1.5 font-medium text-interlig-azul hover:underline">
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

/** "…": atalhos de cópia e impressão. */
export function MenuOpcoes({ protocolo }: { protocolo: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const ref = useFora(aberto, () => setAberto(false));
  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado("Não foi possível copiar");
    }
    setAberto(false);
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((x) => !x)}
        aria-label="Mais opções"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card hover:bg-muted"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-1.5 w-56 rounded-lg border bg-card p-1.5 shadow-lg">
          <button type="button" className={ITEM} onClick={() => copiar(window.location.href, "Link copiado")}>
            <Copy className="h-4 w-4 text-interlig-azul" /> Copiar link do ticket
          </button>
          {protocolo && (
            <button type="button" className={ITEM} onClick={() => copiar(protocolo, "Protocolo copiado")}>
              <Copy className="h-4 w-4 text-interlig-azul" /> Copiar protocolo SZ
            </button>
          )}
          <button type="button" className={ITEM} onClick={() => { setAberto(false); setTimeout(() => window.print(), 50); }}>
            <Printer className="h-4 w-4 text-interlig-azul" /> Imprimir
          </button>
        </div>
      )}
      {copiado && (
        <span className="absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background">
          {copiado}
        </span>
      )}
    </div>
  );
}
