"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { VendaRecente } from "@/lib/tv/comercial";

/** Data e hora de Santarém, no cabeçalho. */
export function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!agora) return null;
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Santarem",
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
    .format(agora)
    .replace(".", "")
    .toUpperCase();
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Santarem",
    hour: "2-digit",
    minute: "2-digit",
  }).format(agora);
  return (
    <div className="text-right">
      <p className="text-sm font-medium tracking-wide text-slate-300">{data}</p>
      <p className="text-5xl font-bold tabular-nums leading-none text-white">{hora}</p>
    </div>
  );
}

/** Recarrega os dados da tela a cada 30s (o sync do SGP roda a cada 5 min). */
export function AutoAtualizar() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type SomAlerta = "sino" | "conexao" | "moedas";
export type EstiloAlerta = "sino" | "marca";

/** Sons gerados no próprio navegador (sem arquivo de áudio). */
function tocarSom(tipo: SomAlerta) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = new Ctx();
    const t = c.currentTime;
    const nota = (freq: number, ini: number, dur: number, forma: OscillatorType, vol: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = forma;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + ini);
      g.gain.exponentialRampToValueAtTime(vol, t + ini + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ini + dur);
      o.connect(g).connect(c.destination);
      o.start(t + ini);
      o.stop(t + ini + dur + 0.05);
    };
    if (tipo === "sino") [1318, 1568, 2093].forEach((f, i) => nota(f, i * 0.2, 1.2, "sine", 0.35));
    if (tipo === "conexao") {
      [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.09, 0.25, "triangle", 0.3));
      [523, 784, 1047].forEach((f) => nota(f, 0.4, 1.2, "sine", 0.15));
    }
    if (tipo === "moedas") {
      nota(1975, 0, 0.35, "square", 0.1);
      nota(2637, 0.11, 0.6, "square", 0.1);
      nota(3951, 0.11, 0.5, "sine", 0.12);
      const buf = c.createBuffer(1, c.sampleRate * 0.12, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ruido = c.createBufferSource();
      const filtro = c.createBiquadFilter();
      const g = c.createGain();
      filtro.type = "highpass";
      filtro.frequency.value = 3000;
      g.gain.value = 0.15;
      ruido.buffer = buf;
      ruido.connect(filtro).connect(g).connect(c.destination);
      ruido.start(t + 0.02);
    }
  } catch {
    // sem áudio: a animação segue sozinha
  }
}

/**
 * Alerta de NOVA VENDA em tela cheia: sino balançando, nome da vendedora,
 * plano, valor e unidade. As vendas que já existiam quando a tela abriu não
 * disparam; as novas entram numa fila (uma comemoração por vez, 7s cada).
 */
export function AlertaNovaVenda({
  vendas,
  totalHoje,
  metaDiaria,
  estilo = "sino",
  som = "sino",
  demo = false,
}: {
  vendas: VendaRecente[];
  totalHoje: number;
  metaDiaria: number;
  estilo?: EstiloAlerta;
  som?: SomAlerta;
  /** ?demo=1: botão que simula uma venda (testar a TV sem esperar venda real) */
  demo?: boolean;
}) {
  const vistas = useRef<Set<string> | null>(null);
  const [fila, setFila] = useState<{ venda: VendaRecente; ordem: number }[]>([]);
  const [somAtivo, setSomAtivo] = useState(false);

  useEffect(() => {
    try {
      setSomAtivo(localStorage.getItem("tv_som") === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (vistas.current === null) {
      vistas.current = new Set(vendas.map((v) => v.id));
      return;
    }
    const novas = vendas.filter((v) => !vistas.current!.has(v.id)).reverse(); // mais antiga primeiro
    if (novas.length === 0) return;
    novas.forEach((v) => vistas.current!.add(v.id));
    setFila((f) => [
      ...f,
      ...novas.map((venda, i) => ({ venda, ordem: totalHoje - novas.length + i + 1 })),
    ]);
  }, [vendas, totalHoje]);

  const atual = fila[0];
  useEffect(() => {
    if (!atual) return;
    if (somAtivo) tocarSom(som);
    const t = setTimeout(() => setFila((f) => f.slice(1)), 7000);
    return () => clearTimeout(t);
  }, [atual, somAtivo, som]);

  return (
    <>
      {!somAtivo && (
        <button
          type="button"
          onClick={() => {
            setSomAtivo(true);
            try {
              localStorage.setItem("tv_som", "1");
            } catch {}
            tocarSom(som);
          }}
          className="fixed bottom-4 right-4 z-40 rounded-full border border-amber-400/50 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-200"
        >
          🔔 Ativar som do sino
        </button>
      )}

      {demo && (
        <button
          type="button"
          onClick={() => {
            const base = vendas[0];
            const venda: VendaRecente = base
              ? { ...base, id: `demo-${Date.now()}` }
              : { id: `demo-${Date.now()}`, vendedora: "Karoline", foto: null, plano: "FIBRA 400MB", valor: 99.9, unidade: "Altamira", criadoEm: new Date().toISOString() };
            setFila((f) => [...f, { venda, ordem: totalHoje + 1 }]);
          }}
          className="fixed bottom-4 left-4 z-40 rounded-full border border-sky-400/50 bg-sky-400/15 px-4 py-2 text-sm font-semibold text-sky-200"
        >
          ▶ Simular venda (demonstração)
        </button>
      )}

      {atual && estilo === "marca" && (
        <div key={atual.venda.id} className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-interlig-marinho" role="alert">
          <style>{`
            @keyframes fibra{0%{left:-45%;opacity:0}15%{opacity:1}100%{left:110%;opacity:0}}
            @keyframes voaA{from{transform:translate(-55vw,-45vh) rotate(-140deg) scale(4);opacity:0}to{transform:none;opacity:1}}
            @keyframes voaB{from{transform:translate(55vw,-45vh) rotate(140deg) scale(4);opacity:0}to{transform:none;opacity:1}}
            @keyframes voaC{from{transform:translate(-55vw,45vh) rotate(140deg) scale(4);opacity:0}to{transform:none;opacity:1}}
            @keyframes voaD{from{transform:translate(55vw,45vh) rotate(-140deg) scale(4);opacity:0}to{transform:none;opacity:1}}
            @keyframes brilhoMarca{0%,100%{filter:brightness(1)}50%{filter:brightness(1.45)}}
                        @keyframes entraMarca{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
            .tv-risco{position:absolute;height:6px;width:45%;animation:fibra 1.5s ease-out both}
            .tv-simbolo{position:relative;width:15rem;aspect-ratio:147/141;margin:0 auto}
            .tv-simbolo img{display:block}
            .tv-px{animation-duration:.95s;animation-timing-function:cubic-bezier(.2,.8,.2,1);animation-fill-mode:both}
            .tv-px-brilho{animation:brilhoMarca 1.6s ease-in-out 1.4s infinite}
            .tv-texto{animation:entraMarca .6s ease-out .9s both}
            @media (prefers-reduced-motion:reduce){.tv-risco,.tv-px,.tv-px-brilho,.tv-texto{animation:none!important}}
          `}</style>
          <span className="tv-risco top-[38%] bg-interlig-claro" />
          <span className="tv-risco top-[52%] bg-interlig-ceu" style={{ animationDelay: ".35s" }} />
          <div className="relative text-center">
            {/* símbolo oficial (os 4 pixels da logo), recortado do arquivo da
                marca e montado no arranjo exato; cada pixel voa de fora da tela */}
            <div className="tv-simbolo">
              {[
                { src: "/marca/simbolo-3.png", l: 0, t: 45.39, w: 57.14, h: 54.61, voo: "voaC", d: 0 },
                { src: "/marca/simbolo-2.png", l: 29.25, t: 14.18, w: 26.53, h: 24.82, voo: "voaA", d: 0.12 },
                { src: "/marca/simbolo-4.png", l: 63.27, t: 50.35, w: 26.53, h: 24.82, voo: "voaD", d: 0.24 },
                { src: "/marca/simbolo-1.png", l: 61.22, t: 0, w: 38.78, h: 36.88, voo: "voaB", d: 0.36 },
              ].map((m) => (
                <span
                  key={m.src}
                  className="tv-px absolute"
                  style={{
                    left: `${m.l}%`,
                    top: `${m.t}%`,
                    width: `${m.w}%`,
                    height: `${m.h}%`,
                    animationName: m.voo,
                    animationDelay: `${m.d}s`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.src} alt="" className="tv-px-brilho h-full w-full" />
                </span>
              ))}
            </div>
            <div className="tv-texto">
              <p className="mt-10 text-3xl font-bold tracking-[0.6em] text-interlig-claro">NOVA VENDA</p>
              <div className="mt-6 flex items-center justify-center gap-6">
                {atual.venda.foto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={atual.venda.foto} alt="" className="h-32 w-32 rounded-full border-4 border-interlig-ceu object-cover" />
                )}
                <p className="text-8xl font-black text-white">{atual.venda.vendedora}</p>
              </div>
              <p className="mt-6 text-4xl font-semibold text-interlig-medio">
                {atual.venda.plano} · {moeda(atual.venda.valor)} · {atual.venda.unidade}
              </p>
              {metaDiaria > 0 && (
                <p className="mt-6 inline-block rounded-full bg-interlig-ceu px-7 py-3 text-2xl font-semibold text-white">
                  {atual.ordem}ª venda do dia · {Math.round((atual.ordem / metaDiaria) * 100)}% da meta diária
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {atual && estilo === "sino" && (
        <div
          key={atual.venda.id}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#04122e]"
          role="alert"
        >
          <style>{`
            @keyframes sinoBalanca{0%,100%{transform:rotate(0)}12%{transform:rotate(24deg)}26%{transform:rotate(-22deg)}40%{transform:rotate(16deg)}54%{transform:rotate(-12deg)}68%{transform:rotate(6deg)}82%{transform:rotate(-3deg)}}
            @keyframes alertaEntra{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:scale(1)}}
            @keyframes onda{from{transform:scale(.5);opacity:.6}to{transform:scale(2.2);opacity:0}}
            .tv-sino{animation:sinoBalanca 1.2s ease-in-out infinite;transform-origin:50% 6%}
            .tv-palco{animation:alertaEntra .5s ease-out both}
            .tv-onda{position:absolute;inset:0;margin:auto;border-radius:9999px;border:6px solid #f5b642;animation:onda 1.8s ease-out infinite}
            @media (prefers-reduced-motion:reduce){.tv-sino,.tv-palco,.tv-onda{animation:none}}
          `}</style>
          <div className="tv-palco text-center">
            <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
              <span className="tv-onda" />
              <span className="tv-onda" style={{ animationDelay: ".6s" }} />
              <span className="tv-sino relative text-[11rem] leading-none" aria-hidden>
                🔔
              </span>
            </div>
            <p className="mt-6 text-3xl font-black tracking-[0.5em] text-amber-300">NOVA VENDA</p>
            <div className="mt-6 flex items-center justify-center gap-6">
              {atual.venda.foto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={atual.venda.foto}
                  alt=""
                  className="h-28 w-28 rounded-full border-4 border-amber-300 object-cover"
                />
              )}
              <p className="text-8xl font-black text-white">{atual.venda.vendedora}</p>
            </div>
            <p className="mt-6 text-4xl font-semibold text-sky-200">
              {atual.venda.plano} · {moeda(atual.venda.valor)}
            </p>
            <p className="mt-3 text-2xl text-sky-300">
              {atual.venda.unidade}
              {metaDiaria > 0 &&
                ` · ${atual.ordem}ª venda do dia · ${Math.round((atual.ordem / metaDiaria) * 100)}% da meta diária`}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Palco 16:9 fixo (1920×1080): escala para PREENCHER a TV — em tela 16:9 ocupa
 * tudo; em proporções diferentes fica centralizado, sem rolagem nem corte.
 */
export function PalcoTv({ children }: { children: React.ReactNode }) {
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const ajustar = () => setEscala(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    ajustar();
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, []);
  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-hidden bg-[#071330]">
      <div style={{ width: 1920 * escala, height: 1080 * escala }}>
        <div style={{ width: 1920, height: 1080, transform: `scale(${escala})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
