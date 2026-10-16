"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { removerInscricaoPush, salvarInscricaoPush, testarAviso } from "@/app/(app)/interchat/acoes";

/**
 * InterChat (16/10/2026) — estado compartilhado do chat interno: lista de
 * conversas, mensagens em tempo real (Supabase Realtime, filtrado pela RLS:
 * cada pessoa só recebe o que é das conversas dela), quem está online e o
 * aviso (web push) deste dispositivo.
 */

export type Pessoa = { id: string; nome: string; perfil: string; foto: string | null };

export type Conversa = {
  id: string;
  tipo: "direta" | "grupo";
  nome: string | null;
  atualizado_em: string;
  ultima_mensagem: string | null;
  ultimo_autor_id: string | null;
  nao_lidas: number;
  outro_id: string | null;
  outro_nome: string | null;
  outro_foto: string | null;
  outro_lido_ate: string | null;
  membros: number;
};

export type Mensagem = {
  id: string;
  conversa_id: string;
  autor_id: string;
  texto: string | null;
  anexo_path: string | null;
  anexo_nome: string | null;
  anexo_tipo: string | null;
  anexo_tamanho: number | null;
  criado_em: string;
  pendente?: boolean;
};

export type EstadoAvisos = "carregando" | "ativo" | "inativo" | "negado" | "indisponivel" | "ios-instalar";

type Ctx = {
  eu: Pessoa;
  ehGestor: boolean;
  pessoas: Map<string, Pessoa>;
  conversas: Conversa[];
  carregado: boolean;
  online: Set<string>;
  naoLidas: number;
  janelas: string[];
  abrir: (id: string) => void;
  fechar: (id: string) => void;
  abrirComPessoa: (usuarioId: string) => Promise<string | null>;
  recarregar: () => Promise<void>;
  ouvir: (conversaId: string, fn: (m: Mensagem) => void) => () => void;
  marcarVisivel: (conversaId: string, visivel: boolean) => void;
  marcarLido: (conversaId: string) => void;
  avisos: EstadoAvisos;
  ativarAvisos: () => Promise<string | null>;
  desativarAvisos: () => Promise<void>;
  nomeDe: (id: string) => string;
  fotoDe: (id: string) => string | null;
  supabase: ReturnType<typeof criarClienteNavegador>;
};

const Contexto = createContext<Ctx | null>(null);
export const useInterChat = () => {
  const c = useContext(Contexto);
  if (!c) throw new Error("InterChat fora do provedor");
  return c;
};

const base64ParaUint8 = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bruto = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
};

/** "plim" curto quando chega mensagem com a tela aberta em outra conversa */
function plim() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.26);
    setTimeout(() => ac.close().catch(() => {}), 400);
  } catch {
    /* sem áudio: segue sem som */
  }
}

export function ProvedorInterChat({
  eu,
  ehGestor,
  chavePush,
  children,
}: {
  eu: Pessoa;
  ehGestor: boolean;
  chavePush: string | null;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [pessoas, setPessoas] = useState<Map<string, Pessoa>>(new Map([[eu.id, eu]]));
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [janelas, setJanelas] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<EstadoAvisos>("carregando");
  const ouvintes = useRef(new Map<string, Set<(m: Mensagem) => void>>());
  const visiveis = useRef(new Map<string, number>());
  const conhecidas = useRef(new Set<string>());

  const recarregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("chat_minhas_conversas");
    if (error) return console.error("interchat:", error.message);
    const lista = (data ?? []) as Conversa[];
    conhecidas.current = new Set(lista.map((c) => c.id));
    setConversas(lista);
    setCarregado(true);
  }, [supabase]);

  // pessoas e conversas
  useEffect(() => {
    recarregar();
    supabase.rpc("chat_pessoas").then(({ data }) => {
      const m = new Map<string, Pessoa>([[eu.id, eu]]);
      for (const p of (data ?? []) as Pessoa[]) m.set(p.id, p);
      setPessoas(m);
    });
  }, [supabase, recarregar, eu]);

  const marcarLido = useCallback(
    (conversaId: string) => {
      setConversas((l) => l.map((c) => (c.id === conversaId && c.nao_lidas ? { ...c, nao_lidas: 0 } : c)));
      supabase.rpc("chat_marcar_lido", { p_conversa: conversaId }).then(() => {});
    },
    [supabase]
  );

  // tempo real: mensagens novas, leituras e entrada em conversas
  useEffect(() => {
    const canal = supabase
      .channel(`interchat-${eu.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_mensagens" }, (p) => {
        const m = p.new as Mensagem;
        if (!conhecidas.current.has(m.conversa_id)) {
          recarregar();
        } else {
          const vendo = (visiveis.current.get(m.conversa_id) ?? 0) > 0 && document.visibilityState === "visible";
          setConversas((l) =>
            l
              .map((c) =>
                c.id !== m.conversa_id
                  ? c
                  : {
                      ...c,
                      atualizado_em: m.criado_em,
                      ultima_mensagem: m.texto?.slice(0, 140) || `📎 ${m.anexo_nome ?? "anexo"}`,
                      ultimo_autor_id: m.autor_id,
                      nao_lidas: m.autor_id !== eu.id && !vendo ? c.nao_lidas + 1 : c.nao_lidas,
                    }
              )
              .sort((a, b) => (a.atualizado_em < b.atualizado_em ? 1 : -1))
          );
          if (m.autor_id !== eu.id) {
            if (vendo) marcarLido(m.conversa_id);
            else plim();
          }
        }
        ouvintes.current.get(m.conversa_id)?.forEach((fn) => fn(m));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_membros" }, (p) => {
        const r = p.new as { conversa_id: string; usuario_id: string; lido_ate: string };
        setConversas((l) =>
          l.map((c) => {
            if (c.id !== r.conversa_id) return c;
            if (r.usuario_id === eu.id) return r.lido_ate >= c.atualizado_em ? { ...c, nao_lidas: 0 } : c;
            return c.tipo === "direta" ? { ...c, outro_lido_ate: r.lido_ate } : c;
          })
        );
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_membros" }, (p) => {
        if ((p.new as { usuario_id: string }).usuario_id === eu.id) recarregar();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, eu.id, recarregar, marcarLido]);

  // quem está online
  useEffect(() => {
    const canal = supabase.channel("interchat-presenca", { config: { presence: { key: eu.id } } });
    canal
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(canal.presenceState()))))
      .subscribe(async (s) => {
        if (s === "SUBSCRIBED") await canal.track({ em: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, eu.id]);

  // aviso (web push) deste dispositivo
  useEffect(() => {
    (async () => {
      const temPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!temPush || !chavePush) return setAvisos(ios && !instalado ? "ios-instalar" : "indisponivel");
      if (Notification.permission === "denied") return setAvisos("negado");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setAvisos("ativo");
          // mantém a inscrição fresca no servidor (troca de usuário no mesmo aparelho)
          salvarInscricaoPush(sub.toJSON() as never, navigator.userAgent).catch(() => {});
        } else setAvisos("inativo");
      } catch {
        setAvisos("indisponivel");
      }
    })();
  }, [chavePush]);

  const ativarAvisos = useCallback(async (): Promise<string | null> => {
    if (!chavePush) return "Avisos indisponíveis.";
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setAvisos(perm === "denied" ? "negado" : "inativo");
        return "Permissão de notificação não concedida.";
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaUint8(chavePush) }));
      const r = await salvarInscricaoPush(sub.toJSON() as never, navigator.userAgent);
      if (r.erro) return r.erro;
      setAvisos("ativo");
      testarAviso().catch(() => {});
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Não foi possível ativar.";
    }
  }, [chavePush]);

  const desativarAvisos = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removerInscricaoPush(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setAvisos("inativo");
    }
  }, []);

  const naoLidas = conversas.reduce((s, c) => s + c.nao_lidas, 0);

  // contador no título da aba e no ícone do app instalado
  useEffect(() => {
    const limpar = () => document.title.replace(/^\(\d+\)\s*/, "");
    const aplicar = () => {
      document.title = naoLidas > 0 ? `(${naoLidas}) ${limpar()}` : limpar();
    };
    aplicar();
    const t = setInterval(aplicar, 1500); // a navegação troca o título
    const nav = navigator as unknown as { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (naoLidas > 0) nav.setAppBadge?.(naoLidas).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
    return () => clearInterval(t);
  }, [naoLidas]);

  const abrir = useCallback((id: string) => {
    setJanelas((j) => [id, ...j.filter((x) => x !== id)].slice(0, 2));
  }, []);
  const fechar = useCallback((id: string) => setJanelas((j) => j.filter((x) => x !== id)), []);

  const abrirComPessoa = useCallback(
    async (usuarioId: string) => {
      const { data, error } = await supabase.rpc("chat_abrir_direta", { p_outro: usuarioId });
      if (error) {
        console.error(error.message);
        return null;
      }
      const id = data as string;
      if (!conhecidas.current.has(id)) {
        const p = pessoas.get(usuarioId);
        conhecidas.current.add(id);
        setConversas((l) => [
          {
            id,
            tipo: "direta",
            nome: null,
            atualizado_em: new Date().toISOString(),
            ultima_mensagem: null,
            ultimo_autor_id: null,
            nao_lidas: 0,
            outro_id: usuarioId,
            outro_nome: p?.nome ?? null,
            outro_foto: p?.foto ?? null,
            outro_lido_ate: null,
            membros: 2,
          },
          ...l,
        ]);
      }
      return id;
    },
    [supabase, pessoas]
  );

  const ouvir = useCallback((conversaId: string, fn: (m: Mensagem) => void) => {
    const s = ouvintes.current.get(conversaId) ?? new Set();
    s.add(fn);
    ouvintes.current.set(conversaId, s);
    return () => {
      s.delete(fn);
    };
  }, []);

  const marcarVisivel = useCallback((conversaId: string, visivel: boolean) => {
    const n = (visiveis.current.get(conversaId) ?? 0) + (visivel ? 1 : -1);
    visiveis.current.set(conversaId, Math.max(0, n));
  }, []);

  const nomeDe = useCallback((id: string) => pessoas.get(id)?.nome ?? "Ex-colaborador", [pessoas]);
  const fotoDe = useCallback((id: string) => pessoas.get(id)?.foto ?? null, [pessoas]);

  return (
    <Contexto.Provider
      value={{
        eu,
        ehGestor,
        pessoas,
        conversas,
        carregado,
        online,
        naoLidas,
        janelas,
        abrir,
        fechar,
        abrirComPessoa,
        recarregar,
        ouvir,
        marcarVisivel,
        marcarLido,
        avisos,
        ativarAvisos,
        desativarAvisos,
        nomeDe,
        fotoDe,
        supabase,
      }}
    >
      {children}
    </Contexto.Provider>
  );
}
