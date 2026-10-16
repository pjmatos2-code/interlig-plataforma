"use client";

import { useState } from "react";
import { ArrowLeft, BellOff, BellRing, PenSquare, Search, Users } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { cn } from "@/lib/utils";
import { useInterChat, type Conversa } from "./provedor";
import { NovoGrupo } from "./grupos";

const TZ = "America/Santarem";
function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const diaMsg = d.toLocaleDateString("en-CA", { timeZone: TZ });
  if (diaMsg === hoje) return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const dias = (Date.parse(hoje) - Date.parse(diaMsg)) / 86_400_000;
  if (dias < 7) return d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "short" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "numeric", month: "short" }).replace(".", "");
}

/** Faixa para ativar o aviso de mensagens neste dispositivo */
export function FaixaAvisos() {
  const { avisos, ativarAvisos } = useInterChat();
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  if (avisos === "ativo" || avisos === "carregando" || avisos === "indisponivel") return null;
  return (
    <div className="mx-3 mb-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-900">
      {avisos === "ios-instalar" ? (
        <p>No iPhone, instale o app para receber avisos: toque em Compartilhar → <strong>Adicionar à Tela de Início</strong> e abra por lá.</p>
      ) : avisos === "negado" ? (
        <p className="flex gap-1.5"><BellOff className="h-4 w-4 shrink-0" /> As notificações estão bloqueadas neste navegador. Libere nas configurações do site para receber avisos.</p>
      ) : (
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 shrink-0" />
          <span className="flex-1">Receba aviso das mensagens neste dispositivo.</span>
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => {
              setOcupado(true);
              const e = await ativarAvisos();
              setOcupado(false);
              setMsg(e);
            }}
            className="rounded-md bg-interlig-azul px-2.5 py-1 font-semibold text-white disabled:opacity-60"
          >
            {ocupado ? "…" : "Ativar"}
          </button>
        </div>
      )}
      {msg && <p className="mt-1 text-destructive">{msg}</p>}
    </div>
  );
}

function Linha({ c, onAbrir, ativa }: { c: Conversa; onAbrir: (id: string) => void; ativa?: boolean }) {
  const { online, eu, nomeDe } = useInterChat();
  const nome = c.tipo === "grupo" ? c.nome ?? "Grupo" : c.outro_nome ?? "Conversa";
  const ehOnline = c.tipo === "direta" && c.outro_id ? online.has(c.outro_id) : false;
  const prefixo = c.ultimo_autor_id === eu.id ? "Você: " : c.tipo === "grupo" && c.ultimo_autor_id ? `${nomeDe(c.ultimo_autor_id).split(" ")[0]}: ` : "";
  return (
    <li>
      <button
        type="button"
        onClick={() => onAbrir(c.id)}
        className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60", ativa && "bg-sky-50")}
      >
        <span className="relative shrink-0">
          {c.tipo === "grupo" ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-interlig-azul/10 text-interlig-azul">
              <Users className="h-5 w-5" />
            </span>
          ) : (
            <span className="block h-11 w-11 [&>span]:h-11 [&>span]:w-11">
              <AvatarAgente nome={nome} foto={c.outro_foto} />
            </span>
          )}
          {ehOnline && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-farol-verde" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm", c.nao_lidas ? "font-bold" : "font-medium")}>{nome}</span>
            <span className={cn("shrink-0 text-[11px]", c.nao_lidas ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {c.ultima_mensagem ? quando(c.atualizado_em) : ""}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className={cn("line-clamp-2 text-xs", c.nao_lidas ? "font-medium text-foreground" : "text-muted-foreground")}>
              {c.ultima_mensagem ? prefixo + c.ultima_mensagem : c.tipo === "grupo" ? `${c.membros} participantes` : "Comece a conversa"}
            </span>
            {c.nao_lidas > 0 && (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-interlig-azul px-1.5 text-[11px] font-bold text-white">
                {c.nao_lidas}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

type Aba = "todas" | "nao_lidas" | "grupos";

/** Lista de conversas + nova conversa (usada no dock e na página) */
export function ListaConversas({ onAbrir, ativa }: { onAbrir: (id: string) => void; ativa?: string | null }) {
  const { conversas, carregado, pessoas, eu, ehGestor, online, abrirComPessoa } = useInterChat();
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("todas");
  const [nova, setNova] = useState(false);
  const [novoGrupo, setNovoGrupo] = useState(false);

  if (nova) {
    const lista = [...pessoas.values()]
      .filter((p) => p.id !== eu.id && (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())))
      .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.nome.localeCompare(b.nome));
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 px-3 py-2">
          <button type="button" onClick={() => { setNova(false); setBusca(""); }} className="rounded-md p-1.5 hover:bg-muted" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">Nova conversa</p>
        </div>
        <div className="relative px-3 pb-2">
          <Search className="pointer-events-none absolute left-5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" className="h-9 w-full rounded-md border border-input bg-muted/40 pl-8 pr-3 text-sm" />
        </div>
        {ehGestor && (
          <button type="button" onClick={() => setNovoGrupo(true)} className="mx-3 mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-interlig-azul hover:bg-muted">
            <Users className="h-4 w-4" /> Novo grupo
          </button>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
          {lista.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={async () => {
                  const id = await abrirComPessoa(p.id);
                  setNova(false);
                  setBusca("");
                  if (id) onAbrir(id);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
              >
                <span className="relative">
                  <AvatarAgente nome={p.nome} foto={p.foto} />
                  {online.has(p.id) && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-farol-verde" />}
                </span>
                <span className="min-w-0 truncate text-sm">{p.nome}</span>
              </button>
            </li>
          ))}
        </ul>
        {novoGrupo && <NovoGrupo onFechar={() => setNovoGrupo(false)} onCriado={(id) => { setNovoGrupo(false); setNova(false); onAbrir(id); }} />}
      </div>
    );
  }

  const filtradas = conversas
    .filter((c) => (aba === "nao_lidas" ? c.nao_lidas > 0 : aba === "grupos" ? c.tipo === "grupo" : true))
    .filter((c) => !busca || (c.tipo === "grupo" ? c.nome ?? "" : c.outro_nome ?? "").toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar mensagens" className="h-9 w-full rounded-md border-0 bg-muted/60 pl-8 pr-3 text-sm" />
        </div>
        <button type="button" onClick={() => { setNova(true); setBusca(""); }} title="Nova conversa" className="rounded-md p-2 text-interlig-azul hover:bg-muted">
          <PenSquare className="h-5 w-5" />
        </button>
      </div>
      <div className="flex border-b px-1 text-sm">
        {(
          [
            ["todas", "Todas"],
            ["nao_lidas", "Não lidas"],
            ["grupos", "Grupos"],
          ] as [Aba, string][]
        ).map(([k, r]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={cn("-mb-px flex-1 border-b-2 px-2 py-2 font-medium", aba === k ? "border-farol-verde text-farol-verde" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="pt-2">
        <FaixaAvisos />
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {filtradas.map((c) => (
          <Linha key={c.id} c={c} onAbrir={onAbrir} ativa={c.id === ativa} />
        ))}
        {carregado && filtradas.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            {aba === "todas" && !busca ? "Nenhuma conversa ainda. Toque no ✏️ para começar." : "Nada por aqui."}
          </li>
        )}
      </ul>
    </div>
  );
}
