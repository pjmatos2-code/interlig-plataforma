"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo animado do dashboard comercial de TV (01/10/2026): rede viva, MUITO
 * sutil — o movimento deve ser percebido depois de alguns segundos, nunca
 * competir com os números.
 *
 * Canvas 2D procedural: a rede é gerada uma vez (nós numa faixa diagonal,
 * como a arte original; ligações fixas entre vizinhos); a cada quadro só as
 * posições oscilam (seno/cosseno, 2–8px, 6–12s). Brilhos são sprites
 * pré-renderizados (drawImage é barato; shadowBlur não). 30 fps e pausa com a
 * aba oculta — a TV fica ligada o dia inteiro.
 */

/** intensidade geral do efeito (0–1) — ajuste rápido aqui ou pela CSS var */
export const OPACIDADE_REDE = 0.32;

type No = {
  x: number; // posição base (0–1 da largura/altura)
  y: number;
  prof: number; // profundidade 0.35–1 (perto = maior, mais forte, mais movimento)
  ampX: number; // amplitude do deslocamento (px na referência de 1920)
  ampY: number;
  perX: number; // período (s)
  perY: number;
  fase: number;
  brilhoPer: number;
  brilhoFase: number;
};
type Ligacao = { a: number; b: number; base: number; per: number; fase: number };
type Particula = { x: number; y: number; vx: number; vy: number; r: number; alfa: number; desfoque: boolean };
type Pulso = { lig: number; ini: number; dur: number; sentido: 1 | -1 };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** brilho radial pré-renderizado (núcleo branco-azulado → azul → transparente) */
function criarSprite(tamanho: number, nucleo: string, meio: string, borda: string) {
  const c = document.createElement("canvas");
  c.width = c.height = tamanho;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(tamanho / 2, tamanho / 2, 0, tamanho / 2, tamanho / 2, tamanho / 2);
  grad.addColorStop(0, nucleo);
  grad.addColorStop(0.18, nucleo);
  grad.addColorStop(0.32, meio);
  grad.addColorStop(1, borda);
  g.fillStyle = grad;
  g.fillRect(0, 0, tamanho, tamanho);
  return c;
}

function gerarRede() {
  const nos: No[] = [];
  // faixa principal: sobe da esquerda-baixo para a direita-meio (arte original)
  for (let i = 0; i < 58; i++) {
    const t = Math.random();
    const centro = 0.8 - 0.42 * t;
    const desvio = (Math.random() + Math.random() + Math.random() - 1.5) * 0.16;
    nos.push(no(t * 1.08 - 0.04, centro + desvio, rand(0.45, 1)));
  }
  // alguns nós soltos e distantes, para profundidade
  for (let i = 0; i < 14; i++) nos.push(no(Math.random(), rand(0.1, 0.95), rand(0.3, 0.5)));

  // ligações fixas: cada nó com os 2–3 vizinhos mais próximos
  const ligs: Ligacao[] = [];
  const chave = new Set<string>();
  nos.forEach((n, i) => {
    const viz = nos
      .map((m, j) => ({ j, d: Math.hypot((m.x - n.x) * 1.78, m.y - n.y) }))
      .filter((v) => v.j !== i && v.d < 0.32)
      .sort((p, q) => p.d - q.d)
      .slice(0, Math.random() < 0.5 ? 2 : 3);
    for (const v of viz) {
      const k = i < v.j ? `${i}-${v.j}` : `${v.j}-${i}`;
      if (chave.has(k)) continue;
      chave.add(k);
      ligs.push({ a: i, b: v.j, base: rand(0.1, 0.26), per: rand(7, 12), fase: rand(0, Math.PI * 2) });
    }
  });

  const particulas: Particula[] = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: rand(-0.004, 0.006),
    vy: rand(-0.006, -0.0015),
    r: rand(0.6, 2.4),
    alfa: rand(0.06, 0.22),
    desfoque: Math.random() < 0.35,
  }));
  return { nos, ligs, particulas };

  function no(x: number, y: number, prof: number): No {
    // ~20% praticamente estáticos; os demais com 2–8px de deriva
    const parado = Math.random() < 0.2;
    return {
      x,
      y,
      prof,
      ampX: parado ? rand(0.5, 1.5) : rand(2, 8) * prof,
      ampY: parado ? rand(0.5, 1.5) : rand(2, 6) * prof,
      perX: rand(6, 12),
      perY: rand(7, 12),
      fase: rand(0, Math.PI * 2),
      brilhoPer: rand(6, 11),
      brilhoFase: rand(0, Math.PI * 2),
    };
  }
}

export function FundoRedeAnimado({ opacidade = OPACIDADE_REDE }: { opacidade?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { nos, ligs, particulas } = gerarRede();
    const spriteNo = criarSprite(64, "rgba(235,246,255,1)", "rgba(110,180,255,0.55)", "rgba(40,120,255,0)");
    const spritePulso = criarSprite(48, "rgba(220,250,255,1)", "rgba(80,220,255,0.6)", "rgba(40,180,255,0)");
    const spriteBokeh = criarSprite(64, "rgba(120,180,255,0.55)", "rgba(80,150,255,0.25)", "rgba(40,110,255,0)");
    const pulsos: Pulso[] = [];
    let proximoPulso = 1.5;

    let W = 0;
    let H = 0;
    let escala = 1; // px de referência (1920) → px reais
    const ajustar = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      // resolução do canvas limitada (efeito é suave; 4K não precisa de 1:1)
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const fator = Math.min(dpr, 2560 / Math.max(1, W));
      canvas.width = Math.round(W * fator);
      canvas.height = Math.round(H * fator);
      ctx.setTransform(fator, 0, 0, fator, 0, 0);
      escala = W / 1920;
    };
    ajustar();
    window.addEventListener("resize", ajustar);

    const posicao = (n: No, t: number, px: number, py: number) => ({
      x: n.x * W + Math.sin((t / n.perX) * Math.PI * 2 + n.fase) * n.ampX * escala + px * n.prof,
      y: n.y * H + Math.cos((t / n.perY) * Math.PI * 2 + n.fase) * n.ampY * escala + py * n.prof,
    });

    const desenhar = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      // parallax automático muito leve (camadas em ritmos diferentes)
      const pxRede = Math.sin(t / 23) * 6 * escala;
      const pyRede = Math.cos(t / 29) * 3 * escala;

      // partículas (fundo, mais lentas, algumas desfocadas)
      for (const p of particulas) {
        const x = ((p.x + p.vx * t) % 1 + 1) % 1;
        const y = ((p.y + p.vy * t) % 1 + 1) % 1;
        const r = p.r * escala * (p.desfoque ? 3.2 : 1.4);
        ctx.globalAlpha = p.alfa;
        ctx.drawImage(p.desfoque ? spriteBokeh : spriteNo, x * W - r, y * H - r, r * 2, r * 2);
      }

      const pos = nos.map((n) => posicao(n, t, pxRede, pyRede));

      // ligações: opacidade 0.08–0.30, variando devagar
      ctx.lineWidth = Math.max(0.6, 0.9 * escala);
      for (const l of ligs) {
        const a = pos[l.a];
        const b = pos[l.b];
        const prof = (nos[l.a].prof + nos[l.b].prof) / 2;
        const alfa = Math.min(0.3, Math.max(0.08, l.base * (0.75 + 0.25 * Math.sin((t / l.per) * Math.PI * 2 + l.fase)) * (0.6 + 0.4 * prof)));
        ctx.globalAlpha = alfa;
        ctx.strokeStyle = "rgb(120,185,255)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // nós: opacidade 0.25–0.70 com pulsação suave
      for (let i = 0; i < nos.length; i++) {
        const n = nos[i];
        const pulsa = 0.5 + 0.5 * Math.sin((t / n.brilhoPer) * Math.PI * 2 + n.brilhoFase);
        ctx.globalAlpha = 0.25 + (0.2 + 0.25 * pulsa) * n.prof;
        const r = (7 + 13 * n.prof * n.prof) * escala;
        ctx.drawImage(spriteNo, pos[i].x - r, pos[i].y - r, r * 2, r * 2);
      }

      // tráfego: de vez em quando um pacote percorre uma ligação
      if (!reduzir && t >= proximoPulso && pulsos.length < 3) {
        pulsos.push({ lig: Math.floor(Math.random() * ligs.length), ini: t, dur: rand(1.1, 1.8), sentido: Math.random() < 0.5 ? 1 : -1 });
        proximoPulso = t + rand(1.4, 3.2);
      }
      for (let k = pulsos.length - 1; k >= 0; k--) {
        const p = pulsos[k];
        const prog = (t - p.ini) / p.dur;
        if (prog >= 1) {
          pulsos.splice(k, 1);
          continue;
        }
        const l = ligs[p.lig];
        const [a, b] = p.sentido === 1 ? [pos[l.a], pos[l.b]] : [pos[l.b], pos[l.a]];
        const s = prog * prog * (3 - 2 * prog); // suaviza a partida e a chegada
        const r = 9 * escala;
        ctx.globalAlpha = 0.75 * Math.sin(Math.PI * prog);
        ctx.drawImage(spritePulso, a.x + (b.x - a.x) * s - r, a.y + (b.y - a.y) * s - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };

    // movimento reduzido: um quadro estático e nada mais
    if (reduzir) {
      desenhar(0);
      return () => window.removeEventListener("resize", ajustar);
    }

    let raf = 0;
    let ultimo = 0;
    const inicio = performance.now();
    const quadro = (agora: number) => {
      raf = requestAnimationFrame(quadro);
      if (agora - ultimo < 1000 / 30) return; // 30 fps bastam para movimento lento
      ultimo = agora;
      desenhar((agora - inicio) / 1000);
    };
    const visibilidade = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    document.addEventListener("visibilitychange", visibilidade);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", visibilidade);
      window.removeEventListener("resize", ajustar);
    };
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ ["--network-background-opacity" as string]: String(opacidade) }}
    >
      {/* base: azul-noite da identidade + luz no canto superior esquerdo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 8% 0%, rgba(30,110,220,0.35), transparent 70%), linear-gradient(160deg, #081D3B 0%, #06162E 45%, #020B1C 100%)",
        }}
      />
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: "var(--network-background-opacity)" }}
      />
      {/* véu de leitura: a rede aparece nas áreas vazias, discreta atrás dos cards */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(2,11,28,0.30), rgba(2,11,28,0.48))" }}
      />
    </div>
  );
}
