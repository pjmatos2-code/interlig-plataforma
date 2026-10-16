"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Maximize2, Minus, Paperclip, Send, Ticket, Users, X } from "lucide-react";
import { AvatarAgente } from "@/components/ui/avatar-agente";
import { reduzirFoto } from "@/lib/imagem/reduzir-foto";
import { cn } from "@/lib/utils";
import { enviarMensagem, prepararAnexo } from "@/app/(app)/interchat/acoes";
import { useInterChat, type Mensagem } from "./provedor";
import { MembrosGrupo } from "./grupos";

const CAMPOS = "id, conversa_id, autor_id, texto, anexo_path, anexo_nome, anexo_tipo, anexo_tamanho, criado_em";
const TZ = "America/Santarem";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
function rotuloDia(d: string) {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const ontem = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ });
  if (d === hoje) return "Hoje";
  if (d === ontem) return "Ontem";
  return d.split("-").reverse().join("/");
}
const tamanho = (b: number | null) => (!b ? "" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** texto com links clicáveis; link de ticket do CRM vira cartão */
function Texto({ texto, minha }: { texto: string; minha: boolean }) {
  const partes = texto.split(/(https?:\/\/[^\s]+|\/crm\/[0-9a-f-]{36})/g);
  const tickets = [...texto.matchAll(/\/crm\/([0-9a-f-]{36})/g)].map((m) => m[1]);
  return (
    <>
      <p className="whitespace-pre-wrap break-words">
        {partes.map((p, i) =>
          /^https?:\/\//.test(p) || /^\/crm\//.test(p) ? (
            <a key={i} href={p} target={p.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer" className={cn("underline", minha ? "text-white" : "text-interlig-ceu")}>
              {p}
            </a>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          )
        )}
      </p>
      {[...new Set(tickets)].slice(0, 2).map((t) => (
        <Link
          key={t}
          href={`/crm/${t}`}
          className={cn("mt-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium", minha ? "bg-white/15 text-white" : "bg-card text-interlig-azul")}
        >
          <Ticket className="h-4 w-4 shrink-0" /> Abrir ticket do CRM
        </Link>
      ))}
    </>
  );
}

export function Conversa({
  conversaId,
  compacto = false,
  onFechar,
  onVoltar,
}: {
  conversaId: string;
  compacto?: boolean;
  onFechar?: () => void;
  onVoltar?: () => void;
}) {
  const { eu, ehGestor, conversas, online, nomeDe, fotoDe, ouvir, marcarVisivel, marcarLido, supabase } = useInterChat();
  const conv = conversas.find((c) => c.id === conversaId);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [temMais, setTemMais] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [minimizada, setMinimizada] = useState(false);
  const [digitando, setDigitando] = useState<Record<string, number>>({});
  const [verMembros, setVerMembros] = useState(false);
  const lista = useRef<HTMLDivElement>(null);
  const colarNoFim = useRef(true);
  const arquivo = useRef<HTMLInputElement>(null);
  const canalDigitando = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ultimoAvisoDigitando = useRef(0);

  // primeiras mensagens
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setMsgs([]);
    supabase
      .from("chat_mensagens")
      .select(CAMPOS)
      .eq("conversa_id", conversaId)
      .order("criado_em", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (!vivo) return;
        const l = ((data ?? []) as Mensagem[]).reverse();
        setMsgs(l);
        setTemMais((data ?? []).length === 40);
        setCarregando(false);
        colarNoFim.current = true;
      });
    return () => {
      vivo = false;
    };
  }, [conversaId, supabase]);

  // novas mensagens em tempo real
  useEffect(
    () =>
      ouvir(conversaId, (m) => {
        setMsgs((l) => (l.some((x) => x.id === m.id) ? l : [...l.filter((x) => !(x.pendente && x.autor_id === m.autor_id && x.texto === m.texto)), m]));
        setDigitando((d) => {
          const n = { ...d };
          delete n[m.autor_id];
          return n;
        });
      }),
    [conversaId, ouvir]
  );

  // visível = lida
  useEffect(() => {
    if (minimizada) return;
    marcarVisivel(conversaId, true);
    marcarLido(conversaId);
    const vis = () => document.visibilityState === "visible" && marcarLido(conversaId);
    document.addEventListener("visibilitychange", vis);
    return () => {
      marcarVisivel(conversaId, false);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [conversaId, minimizada, marcarVisivel, marcarLido]);

  // "digitando…"
  useEffect(() => {
    const canal = supabase.channel(`interchat-digitando-${conversaId}`);
    canal
      .on("broadcast", { event: "digitando" }, ({ payload }) => {
        const id = (payload as { id: string }).id;
        if (id !== eu.id) setDigitando((d) => ({ ...d, [id]: Date.now() }));
      })
      .subscribe();
    canalDigitando.current = canal;
    const t = setInterval(
      () =>
        setDigitando((d) => {
          const agora = Date.now();
          const n = Object.fromEntries(Object.entries(d).filter(([, ts]) => agora - ts < 4000));
          return Object.keys(n).length === Object.keys(d).length ? d : n;
        }),
      1000
    );
    return () => {
      clearInterval(t);
      supabase.removeChannel(canal);
    };
  }, [conversaId, supabase, eu.id]);

  useLayoutEffect(() => {
    if (colarNoFim.current && lista.current) lista.current.scrollTop = lista.current.scrollHeight;
  }, [msgs, carregando, minimizada]);

  const carregarAnteriores = useCallback(async () => {
    const primeira = msgs.find((m) => !m.pendente);
    if (!primeira) return;
    const el = lista.current;
    const alturaAntes = el?.scrollHeight ?? 0;
    const { data } = await supabase
      .from("chat_mensagens")
      .select(CAMPOS)
      .eq("conversa_id", conversaId)
      .lt("criado_em", primeira.criado_em)
      .order("criado_em", { ascending: false })
      .limit(40);
    colarNoFim.current = false;
    setMsgs((l) => [...((data ?? []) as Mensagem[]).reverse(), ...l]);
    setTemMais((data ?? []).length === 40);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - alturaAntes;
    });
  }, [msgs, supabase, conversaId]);

  async function enviar(anexo?: { path: string; nome: string; tipo: string; tamanho: number }) {
    const t = texto;
    if (!t.trim() && !anexo) return;
    setErro(null);
    const tmp: Mensagem = {
      id: `tmp-${Date.now()}`,
      conversa_id: conversaId,
      autor_id: eu.id,
      texto: t.trim() ? t : null,
      anexo_path: anexo?.path ?? null,
      anexo_nome: anexo?.nome ?? null,
      anexo_tipo: anexo?.tipo ?? null,
      anexo_tamanho: anexo?.tamanho ?? null,
      criado_em: new Date().toISOString(),
      pendente: true,
    };
    colarNoFim.current = true;
    setMsgs((l) => [...l, tmp]);
    setTexto("");
    setEnviando(true);
    const r = await enviarMensagem(conversaId, t, anexo ?? null);
    setEnviando(false);
    if (r.erro || !r.dados) {
      setMsgs((l) => l.filter((m) => m.id !== tmp.id));
      setTexto(t);
      setErro(r.erro ?? "Falha ao enviar.");
      return;
    }
    setMsgs((l) => {
      if (l.some((m) => m.id === r.dados!.id)) return l.filter((m) => m.id !== tmp.id);
      return l.map((m) => (m.id === tmp.id ? { ...tmp, id: r.dados!.id, criado_em: r.dados!.criado_em, pendente: false } : m));
    });
  }

  async function anexar(f: File) {
    setErro(null);
    try {
      const final = f.type.startsWith("image/") && f.size > 1.5 * 1024 * 1024 ? await reduzirFoto(f) : f;
      if (final.size > 10 * 1024 * 1024) return setErro("Arquivo maior que 10 MB.");
      setEnviando(true);
      const prep = await prepararAnexo(conversaId, final.name || f.name, final.type || f.type, final.size);
      if (prep.erro || !prep.dados) {
        setEnviando(false);
        return setErro(prep.erro ?? "Falha ao preparar o envio.");
      }
      const up = await supabase.storage.from("interchat").uploadToSignedUrl(prep.dados.path, prep.dados.token, final, { contentType: final.type || f.type });
      if (up.error) {
        setEnviando(false);
        return setErro("Falha ao enviar o arquivo.");
      }
      await enviar({ path: prep.dados.path, nome: f.name, tipo: final.type || f.type, tamanho: final.size });
    } catch {
      setEnviando(false);
      setErro("Não foi possível anexar o arquivo.");
    }
  }

  const titulo = conv ? (conv.tipo === "grupo" ? conv.nome ?? "Grupo" : conv.outro_nome ?? "Conversa") : "Conversa";
  const ehOnline = conv?.tipo === "direta" && conv.outro_id ? online.has(conv.outro_id) : false;
  const quemDigita = Object.keys(digitando).map((id) => nomeDe(id).split(" ")[0]);
  const minhaUltima = [...msgs].reverse().find((m) => m.autor_id === eu.id && !m.pendente);
  const vista = conv?.tipo === "direta" && minhaUltima && conv.outro_lido_ate && conv.outro_lido_ate >= minhaUltima.criado_em;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-card", compacto && "rounded-t-xl border shadow-2xl")}>
      {/* cabeçalho */}
      <div className={cn("flex items-center gap-2.5 border-b px-3", compacto ? "h-12 cursor-pointer" : "h-14")} onClick={compacto ? () => setMinimizada((v) => !v) : undefined}>
        {onVoltar && (
          <button type="button" onClick={onVoltar} className="rounded-md p-1.5 hover:bg-muted" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <span className="relative">
          {conv?.tipo === "grupo" ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-interlig-azul/10 text-interlig-azul">
              <Users className="h-4 w-4" />
            </span>
          ) : (
            <AvatarAgente nome={titulo} foto={conv?.outro_foto ?? null} />
          )}
          {ehOnline && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-farol-verde" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titulo}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {quemDigita.length ? `${quemDigita.join(", ")} digitando…` : conv?.tipo === "grupo" ? `${conv.membros} participantes` : ehOnline ? "Online" : "Offline"}
          </p>
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          {conv?.tipo === "grupo" && (
            <button type="button" onClick={() => setVerMembros(true)} title="Participantes" className="rounded-md p-1.5 hover:bg-muted">
              <Users className="h-4 w-4" />
            </button>
          )}
          {compacto && (
            <>
              <Link href={`/interchat?c=${conversaId}`} title="Abrir em tela cheia" className="rounded-md p-1.5 hover:bg-muted">
                <Maximize2 className="h-4 w-4" />
              </Link>
              <button type="button" onClick={() => setMinimizada((v) => !v)} title="Minimizar" className="rounded-md p-1.5 hover:bg-muted">
                <Minus className="h-4 w-4" />
              </button>
            </>
          )}
          {onFechar && (
            <button type="button" onClick={onFechar} title="Fechar" className="rounded-md p-1.5 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!minimizada && (
        <>
          {/* mensagens */}
          <div
            ref={lista}
            onScroll={(e) => {
              const el = e.currentTarget;
              colarNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-muted/20 px-3 py-3"
          >
            {temMais && (
              <div className="pb-2 text-center">
                <button type="button" onClick={carregarAnteriores} className="rounded-full border bg-card px-3 py-1 text-xs hover:bg-muted">
                  Carregar mensagens anteriores
                </button>
              </div>
            )}
            {carregando && <p className="py-6 text-center text-xs text-muted-foreground">Carregando…</p>}
            {!carregando && msgs.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda. Diga oi! 👋</p>
            )}
            {msgs.map((m, i) => {
              const minha = m.autor_id === eu.id;
              const anterior = msgs[i - 1];
              const novoDia = !anterior || dia(anterior.criado_em) !== dia(m.criado_em);
              const mostraAutor = conv?.tipo === "grupo" && !minha && (novoDia || anterior?.autor_id !== m.autor_id);
              const ehImagem = m.anexo_tipo?.startsWith("image/");
              const linkAnexo = m.pendente ? null : `/api/interchat/anexo?m=${m.id}`;
              return (
                <Fragment key={m.id}>
                  {novoDia && (
                    <div className="py-2 text-center">
                      <span className="rounded-full bg-card px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">{rotuloDia(dia(m.criado_em))}</span>
                    </div>
                  )}
                  <div className={cn("flex gap-2", minha ? "justify-end" : "justify-start", mostraAutor && "pt-1.5")}>
                    {!minha && conv?.tipo === "grupo" && (
                      <span className="mt-auto w-7 shrink-0">{mostraAutor || msgs[i + 1]?.autor_id !== m.autor_id ? <AvatarAgente nome={nomeDe(m.autor_id)} foto={fotoDe(m.autor_id)} tamanho="sm" /> : null}</span>
                    )}
                    <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm", minha ? "rounded-br-md bg-interlig-azul text-white" : "rounded-bl-md bg-card", m.pendente && "opacity-70")}>
                      {mostraAutor && <p className="mb-0.5 text-[11px] font-semibold text-interlig-ceu">{nomeDe(m.autor_id)}</p>}
                      {m.anexo_path &&
                        (ehImagem && linkAnexo ? (
                          <a href={linkAnexo} target="_blank" rel="noopener noreferrer" className="mb-1 block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={linkAnexo} alt={m.anexo_nome ?? "imagem"} className="max-h-60 rounded-lg object-cover" loading="lazy" />
                          </a>
                        ) : (
                          <a
                            href={linkAnexo ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn("mb-1 flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs", minha ? "bg-white/15" : "bg-muted")}
                          >
                            <FileText className="h-5 w-5 shrink-0" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{m.anexo_nome}</span>
                              <span className="opacity-75">{tamanho(m.anexo_tamanho)}</span>
                            </span>
                          </a>
                        ))}
                      {m.texto && <Texto texto={m.texto} minha={minha} />}
                      <p className={cn("mt-0.5 text-right text-[10px]", minha ? "text-white/70" : "text-muted-foreground")}>
                        {m.pendente ? "enviando…" : hora(m.criado_em)}
                      </p>
                    </div>
                  </div>
                  {minhaUltima?.id === m.id && vista && <p className="pr-1 text-right text-[10px] text-muted-foreground">Visto</p>}
                </Fragment>
              );
            })}
          </div>

          {/* escrever */}
          <div className="border-t p-2">
            {erro && <p className="px-1 pb-1 text-xs text-destructive">{erro}</p>}
            <div className="flex items-end gap-1.5">
              <input
                ref={arquivo}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void anexar(f);
                }}
              />
              <button type="button" onClick={() => arquivo.current?.click()} disabled={enviando} title="Anexar foto ou arquivo" className="rounded-md p-2 text-muted-foreground hover:bg-muted disabled:opacity-50">
                <Paperclip className="h-5 w-5" />
              </button>
              <textarea
                value={texto}
                rows={1}
                onChange={(e) => {
                  setTexto(e.target.value);
                  if (Date.now() - ultimoAvisoDigitando.current > 2000) {
                    ultimoAvisoDigitando.current = Date.now();
                    canalDigitando.current?.send({ type: "broadcast", event: "digitando", payload: { id: eu.id } });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder="Escreva uma mensagem…"
                maxLength={4000}
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm"
                style={{ height: Math.min(128, 40 + Math.max(0, texto.split("\n").length - 1) * 20) }}
              />
              <button
                type="button"
                onClick={() => void enviar()}
                disabled={!texto.trim()}
                title="Enviar"
                className="rounded-full bg-interlig-azul p-2.5 text-white hover:bg-interlig-azul/90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
      {verMembros && conv && <MembrosGrupo conversaId={conv.id} podeEditar={ehGestor} onFechar={() => setVerMembros(false)} />}
    </div>
  );
}
