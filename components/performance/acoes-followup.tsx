"use client";

import { useState, useTransition } from "react";
import { Check, CalendarClock, X, Loader2 } from "lucide-react";
import {
  aceitarSugestaoPerf,
  agendarRetornoPerf,
  cancelarFollowupPerf,
  concluirFollowupPerf,
  rejeitarSugestaoPerf,
  reprogramarFollowupPerf,
  type Resposta,
} from "@/app/(app)/performance/acoes";
import { cn } from "@/lib/utils";

const hojeSantarem = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const amanha = () => new Date(Date.now() - 3 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const rodar = (f: () => Promise<Resposta>) => iniciar(async () => setMsg(await f()));
  return { pendente, msg, rodar };
}

function Mensagem({ msg }: { msg: Resposta | null }) {
  if (!msg) return null;
  return <p role="status" className={cn("mt-1 text-xs", msg.erro ? "text-farol-vermelho" : "text-farol-verde")}>{msg.erro ?? msg.ok}</p>;
}

const botao = "inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted disabled:opacity-50";

/** concluir (com resultado), reprogramar e cancelar um follow-up aberto */
export function AcoesFollowup({ id, podeCancelar = true }: { id: string; /** vencido só a coordenação cancela (conta na taxa de execução) */ podeCancelar?: boolean }) {
  const { pendente, msg, rodar } = useAcao();
  const [modo, setModo] = useState<"nada" | "concluir" | "reprogramar" | "cancelar">("nada");
  const [data, setData] = useState(amanha());
  const [motivo, setMotivo] = useState("");
  return (
    <div className="min-w-[13rem]">
      {modo === "nada" && (
        <div className="flex flex-wrap gap-1">
          <button type="button" className={cn(botao, "border-farol-verde/40 text-farol-verde")} onClick={() => setModo("concluir")} disabled={pendente}>
            <Check className="h-3.5 w-3.5" aria-hidden /> Concluir
          </button>
          <button type="button" className={botao} onClick={() => setModo("reprogramar")} disabled={pendente}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Reprogramar
          </button>
          {podeCancelar && (
            <button type="button" className={cn(botao, "text-muted-foreground")} onClick={() => setModo("cancelar")} disabled={pendente} aria-label="Cancelar follow-up">
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
      {modo === "concluir" && (
        <div className="flex flex-wrap items-center gap-1">
          {[
            ["avancou", "Avançou"],
            ["assinou", "Assinou"],
            ["sem_resposta", "Sem resposta"],
            ["perdido", "Perdido"],
          ].map(([v, r]) => (
            <button key={v} type="button" className={botao} disabled={pendente} onClick={() => rodar(() => concluirFollowupPerf(id, v))}>
              {r}
            </button>
          ))}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setModo("nada")}>voltar</button>
        </div>
      )}
      {modo === "reprogramar" && (
        <div className="flex flex-wrap items-center gap-1">
          <input type="date" aria-label="Nova data" min={hojeSantarem()} value={data} onChange={(e) => setData(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" />
          <button type="button" className={cn(botao, "bg-interlig-azul text-white hover:bg-interlig-azul/90")} disabled={pendente || !data} onClick={() => rodar(() => reprogramarFollowupPerf(id, data))}>
            Salvar
          </button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setModo("nada")}>voltar</button>
        </div>
      )}
      {modo === "cancelar" && (
        <div className="flex flex-wrap items-center gap-1">
          <input aria-label="Motivo do cancelamento" placeholder="Por que cancelar?" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" />
          <button type="button" className={botao} disabled={pendente || motivo.trim().length < 5} onClick={() => rodar(() => cancelarFollowupPerf(id, motivo))}>
            Cancelar follow-up
          </button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setModo("nada")}>voltar</button>
        </div>
      )}
      {pendente && <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Salvando" />}
      <Mensagem msg={msg} />
    </div>
  );
}

/** aceitar (editando a data) ou rejeitar uma sugestão da IA */
export function AcoesSugestao({ id, dataSugerida }: { id: string; dataSugerida: string }) {
  const { pendente, msg, rodar } = useAcao();
  const [data, setData] = useState(dataSugerida < hojeSantarem() ? hojeSantarem() : dataSugerida);
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  return (
    <div className="min-w-[13rem]">
      {!rejeitando ? (
        <div className="flex flex-wrap items-center gap-1">
          <input type="date" aria-label="Data do retorno" min={hojeSantarem()} value={data} onChange={(e) => setData(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" />
          <button type="button" className={cn(botao, "bg-interlig-azul text-white hover:bg-interlig-azul/90")} disabled={pendente} onClick={() => rodar(() => aceitarSugestaoPerf(id, data))}>
            Aceitar
          </button>
          <button type="button" className={botao} disabled={pendente} onClick={() => setRejeitando(true)}>
            Rejeitar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <input aria-label="Motivo" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" />
          <button type="button" className={botao} disabled={pendente} onClick={() => rodar(() => rejeitarSugestaoPerf(id, motivo))}>
            Confirmar
          </button>
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setRejeitando(false)}>voltar</button>
        </div>
      )}
      <Mensagem msg={msg} />
    </div>
  );
}

/** agendar retorno para um lead sem retorno */
export function AgendarRetorno({ ticketId }: { ticketId: string }) {
  const { pendente, msg, rodar } = useAcao();
  const [data, setData] = useState(amanha());
  return (
    <div className="min-w-[12rem]">
      <div className="flex flex-wrap items-center gap-1">
        <input type="date" aria-label="Data do retorno" min={hojeSantarem()} value={data} onChange={(e) => setData(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" />
        <button type="button" className={cn(botao, "bg-interlig-azul text-white hover:bg-interlig-azul/90")} disabled={pendente || !data} onClick={() => rodar(() => agendarRetornoPerf(ticketId, data))}>
          Agendar
        </button>
      </div>
      <Mensagem msg={msg} />
    </div>
  );
}
