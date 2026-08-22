import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { carregarRanking, type LinhaRanking } from "@/lib/ranking/dados";
import { formatarMoeda } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AtualizadorTotem } from "./atualizador";

export const dynamic = "force-dynamic";

type Periodo = "dia" | "semana" | "mes";
const ROTULO: Record<Periodo, string> = { dia: "DIA", semana: "SEMANA", mes: "MÊS" };

/** Avatar com foto da vendedora ou iniciais, com anel colorido do pódio. */
function Avatar({
  linha,
  tamanho,
  anel,
}: {
  linha: { nome: string; foto: string | null };
  tamanho: string;
  anel: string;
}) {
  const iniciais = linha.nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <div className={cn("relative shrink-0 rounded-full p-[3px]", anel, tamanho)}>
      {linha.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={linha.foto}
          alt={linha.nome}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-800 font-bold text-white">
          {iniciais}
        </div>
      )}
    </div>
  );
}

function Seta({ variacao }: { variacao: number | null }) {
  if (variacao === null || variacao === 0)
    return <span className="text-xs text-slate-500">—</span>;
  return variacao > 0 ? (
    <span className="text-xs font-bold text-emerald-400">↑ {variacao}</span>
  ) : (
    <span className="text-xs font-bold text-rose-400">↓ {Math.abs(variacao)}</span>
  );
}

/** Fundo com a identidade Interlig: malha de fibra (nós + conexões) em azul. */
function FundoRede() {
  // malha determinística (nós em % do viewBox 100x178 ~ 9:16)
  const nos: [number, number, number][] = [
    [8, 22, 1.1], [22, 34, 1.6], [38, 26, 1.2], [55, 38, 2.2], [72, 28, 1.4],
    [88, 40, 1.8], [14, 58, 2.0], [32, 66, 1.3], [50, 58, 1.6], [68, 70, 2.4],
    [86, 62, 1.2], [6, 92, 1.5], [26, 100, 2.1], [46, 90, 1.3], [64, 104, 1.7],
    [84, 96, 2.3], [16, 130, 1.4], [36, 138, 1.9], [56, 128, 1.3], [76, 140, 2.0],
    [92, 126, 1.3], [10, 162, 1.8], [30, 168, 1.2], [52, 158, 2.2], [74, 166, 1.4], [90, 158, 1.6],
  ];
  const liga: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [1, 6], [2, 8], [3, 8], [3, 9], [4, 9],
    [5, 10], [6, 7], [7, 8], [8, 9], [9, 10], [6, 11], [7, 12], [8, 13], [9, 14],
    [10, 15], [11, 12], [12, 13], [13, 14], [14, 15], [12, 16], [13, 17], [14, 18],
    [15, 19], [16, 17], [17, 18], [18, 19], [19, 20], [16, 21], [17, 22], [18, 23],
    [19, 24], [20, 25], [21, 22], [22, 23], [23, 24], [24, 25], [3, 10], [9, 15], [13, 18],
  ];
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* luz superior esquerda, como na identidade */}
      <div
        className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(56,130,246,.28), transparent 65%)" }}
      />
      <svg
        viewBox="0 0 100 178"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        style={{ animation: "derivar 26s ease-in-out infinite alternate" }}
      >
        <g stroke="#7fb4ff" strokeWidth="0.18" opacity="0.5">
          {liga.map(([a, b], i) => (
            <line key={i} x1={nos[a][0]} y1={nos[a][1]} x2={nos[b][0]} y2={nos[b][1]} opacity={0.25 + (i % 4) * 0.12} />
          ))}
        </g>
        {nos.map(([x, y, r], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 1.9} fill="#3b82f6" opacity="0.12" />
            <circle cx={x} cy={y} r={r * 0.55} fill="#dbeafe" opacity="0.9">
              <animate
                attributeName="opacity"
                values="0.9;0.35;0.9"
                dur={`${3 + (i % 5)}s`}
                begin={`${(i % 7) * 0.6}s`}
                repeatCount="indefinite"
              />
            </circle>
          </g>
        ))}
      </svg>
      {/* véu para manter o conteúdo legível */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(5,8,23,.42), rgba(5,8,23,.62))" }} />
    </div>
  );
}

const CONFETES = [
  { l: "6%", d: "0s", c: "#f59e0b" }, { l: "14%", d: "1.2s", c: "#38bdf8" },
  { l: "22%", d: "2.4s", c: "#a78bfa" }, { l: "30%", d: "0.6s", c: "#34d399" },
  { l: "38%", d: "1.8s", c: "#fb7185" }, { l: "46%", d: "3s", c: "#fbbf24" },
  { l: "54%", d: "0.3s", c: "#22d3ee" }, { l: "62%", d: "2.1s", c: "#f472b6" },
  { l: "70%", d: "0.9s", c: "#a3e635" }, { l: "78%", d: "2.7s", c: "#fb923c" },
  { l: "86%", d: "1.5s", c: "#818cf8" }, { l: "94%", d: "3.3s", c: "#facc15" },
];

export default async function TotemRankingPage({
  searchParams,
}: {
  searchParams: { p?: string };
}) {
  const usuario = await exigirUsuario();
  const popEscopo = usuario.perfil === "supervisor" ? usuario.pop_id : null;
  const dados = await carregarRanking(popEscopo);

  const periodo: Periodo = (["dia", "semana", "mes"] as const).includes(
    searchParams.p as Periodo
  )
    ? (searchParams.p as Periodo)
    : "semana";
  const linhas = dados.podios[periodo].filter((l) => l.vendas > 0);
  const totais = dados.totais[periodo];
  const [p1, p2, p3] = [linhas[0], linhas[1], linhas[2]];
  const resto = linhas.slice(3, 10);
  const streaksTop = dados.streaks.slice(0, 5);
  const maiorStreak = Math.max(1, ...streaksTop.map((s) => s.streak));
  const b = dados.badges;

  return (
    <main
      className="min-h-screen text-white"
      style={{
        background:
          "radial-gradient(1200px 600px at 50% -10%, #16205c 0%, #0a102f 45%, #050817 100%)",
      }}
    >
      {/* animações do totem */}
      <style>{`
        @keyframes confete { 0% { transform: translateY(-4vh) rotate(0deg); opacity: 0 }
          12% { opacity: 1 } 100% { transform: translateY(106vh) rotate(720deg); opacity: 0 } }
        @keyframes flutuar { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }
        @keyframes pulsar { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
        @keyframes brilho { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes subir { from { transform: translateY(14px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes chama { 0%,100% { transform: scale(1) } 50% { transform: scale(1.25) rotate(-6deg) } }
        @keyframes derivar { from { transform: translate3d(-1.5%, -1%, 0) scale(1.05) } to { transform: translate3d(1.5%, 1%, 0) scale(1.05) } }
        .anim-subir { animation: subir .5s ease-out both }
        @media (prefers-reduced-motion: reduce) { .confete, .coroa, .aovivo, .chama-viva { animation: none !important } }
      `}</style>

      <FundoRede />

      {/* confetes */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        {CONFETES.map((c, i) => (
          <span
            key={i}
            className="confete absolute top-0 block h-2.5 w-1.5 rounded-sm"
            style={{
              left: c.l,
              backgroundColor: c.c,
              animation: `confete ${5 + (i % 4)}s linear ${c.d} infinite`,
            }}
          />
        ))}
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[560px] flex-col gap-4 px-4 py-5">
        {/* ---------- cabeçalho ---------- */}
        <header className="anim-subir text-center">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold tracking-widest text-sky-300">
              ⭐ INTERLIG · VENDAS
            </span>
            <span className="aovivo inline-flex items-center gap-1.5 rounded-full border border-rose-500/60 bg-rose-600/20 px-2.5 py-1 font-bold text-rose-300" style={{ animation: "pulsar 1.6s ease-in-out infinite" }}>
              ● AO VIVO
            </span>
          </div>
          <div className="coroa mx-auto w-fit text-3xl" style={{ animation: "flutuar 3s ease-in-out infinite" }}>👑</div>
          <h1
            className="bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-4xl font-black tracking-tight text-transparent"
            style={{ textShadow: "0 0 40px rgba(148,163,255,.25)" }}
          >
            RANKING DE VENDAS
          </h1>
          <p className="mt-0.5 text-xs font-semibold tracking-widest text-amber-300">
            ⚡ ATUALIZAÇÃO EM TEMPO REAL ⚡
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Última atualização: <span className="font-semibold text-emerald-400">AGORA</span> ·{" "}
            <AtualizadorTotem />
          </p>
        </header>

        {/* ---------- período ---------- */}
        <nav className="anim-subir mx-auto flex rounded-full border border-white/10 bg-white/5 p-1 text-xs font-bold">
          {(["dia", "semana", "mes"] as const).map((pp) => (
            <Link
              key={pp}
              href={`/tv/ranking?p=${pp}`}
              className={cn(
                "rounded-full px-5 py-1.5 transition-colors",
                pp === periodo ? "bg-sky-600 text-white shadow-lg shadow-sky-900/60" : "text-slate-300 hover:text-white"
              )}
            >
              {ROTULO[pp]}
            </Link>
          ))}
        </nav>

        {/* ---------- pódio ---------- */}
        {linhas.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Ainda sem vendas neste recorte.</p>
        ) : (
          <section className="anim-subir grid grid-cols-3 items-end gap-2">
            {/* 2º */}
            <div className="rounded-2xl border border-slate-400/30 bg-gradient-to-b from-slate-500/20 to-slate-800/40 p-3 text-center">
              {p2 ? (
                <>
                  <div className="relative mx-auto w-fit">
                    <Avatar linha={p2} tamanho="h-20 w-20" anel="bg-gradient-to-br from-slate-200 to-slate-500" />
                    <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-500 text-sm font-black text-slate-800 shadow">2</span>
                  </div>
                  <p className="mt-2 truncate text-[10px] font-semibold tracking-wider text-slate-400">{p2.pop.toUpperCase()}</p>
                  <p className="truncate text-lg font-extrabold">{p2.nome}</p>
                  <p className="text-sm font-bold text-emerald-400">{formatarMoeda(p2.receita)}</p>
                  <p className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-sky-300">⭐ {p2.pontos.toLocaleString("pt-BR")} pts</p>
                </>
              ) : (
                <p className="py-8 text-xs text-slate-500">—</p>
              )}
            </div>

            {/* 1º */}
            <div
              className="relative rounded-2xl border border-amber-300/50 p-3 pb-4 text-center"
              style={{
                background: "linear-gradient(180deg, rgba(251,191,36,.22), rgba(120,70,10,.25))",
                boxShadow: "0 0 44px rgba(251,191,36,.28)",
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2xl"
                style={{
                  background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,.14) 50%, transparent 70%)",
                  backgroundSize: "200% 100%",
                  animation: "brilho 3.2s linear infinite",
                }}
              />
              {p1 && (
                <>
                  <div className="coroa mx-auto -mt-7 w-fit text-3xl" style={{ animation: "flutuar 3s ease-in-out infinite" }}>👑</div>
                  <div className="relative mx-auto w-fit">
                    <Avatar linha={p1} tamanho="h-28 w-28" anel="bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600" />
                    <span className="absolute -left-1 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-600 text-base font-black text-amber-950 shadow-lg">1</span>
                  </div>
                  <p className="mt-2 inline-block rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-200">{p1.pop.toUpperCase()}</p>
                  <p className="truncate text-2xl font-black">{p1.nome}</p>
                  <p className="text-xl font-extrabold text-emerald-400">{formatarMoeda(p1.receita)}</p>
                  <p className="mt-1 inline-block rounded-full bg-amber-400/25 px-3 py-1 text-sm font-black text-amber-200">⭐ {p1.pontos.toLocaleString("pt-BR")} pts</p>
                </>
              )}
            </div>

            {/* 3º */}
            <div className="rounded-2xl border border-orange-400/30 bg-gradient-to-b from-orange-500/15 to-orange-950/40 p-3 text-center">
              {p3 ? (
                <>
                  <div className="relative mx-auto w-fit">
                    <Avatar linha={p3} tamanho="h-20 w-20" anel="bg-gradient-to-br from-orange-300 to-orange-700" />
                    <span className="absolute -left-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-300 to-orange-700 text-sm font-black text-orange-950 shadow">3</span>
                  </div>
                  <p className="mt-2 truncate text-[10px] font-semibold tracking-wider text-orange-300/80">{p3.pop.toUpperCase()}</p>
                  <p className="truncate text-lg font-extrabold">{p3.nome}</p>
                  <p className="text-sm font-bold text-emerald-400">{formatarMoeda(p3.receita)}</p>
                  <p className="mt-1 inline-block rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-orange-300">⭐ {p3.pontos.toLocaleString("pt-BR")} pts</p>
                </>
              ) : (
                <p className="py-8 text-xs text-slate-500">—</p>
              )}
            </div>
          </section>
        )}

        {/* ---------- top 10 ---------- */}
        {resto.length > 0 && (
          <section className="anim-subir rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="mb-2 text-sm font-black tracking-wide text-sky-300">
              📈 TOP 10 · {ROTULO[periodo]}
            </h2>
            <div className="mb-1 grid grid-cols-[2rem_1fr_auto_2.5rem] gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <span>Pos.</span><span>Vendedora</span><span className="text-right">Vendas (R$)</span><span className="text-right">Var.</span>
            </div>
            <ul className="divide-y divide-white/5">
              {resto.map((l: LinhaRanking) => (
                <li key={l.vendedorId} className="grid grid-cols-[2rem_1fr_auto_2.5rem] items-center gap-2 py-1.5">
                  <span className="text-sm font-bold text-slate-400">{l.posicao}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar linha={l} tamanho="h-7 w-7" anel="bg-white/20" />
                    <span className="truncate text-sm font-semibold">{l.nome}</span>
                  </span>
                  <span className="text-right text-sm font-bold tabular-nums">{formatarMoeda(l.receita)}</span>
                  <span className="text-right"><Seta variacao={l.variacao} /></span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- sequências ---------- */}
        <section className="anim-subir rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-black tracking-wide text-orange-300">🔥 SEQUÊNCIAS (STREAKS)</h2>
          <ul className="space-y-2.5">
            {streaksTop.map((s, i) => (
              <li key={s.vendedorId} className="flex items-center gap-2.5">
                <span className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black",
                  i === 0 ? "bg-amber-400 text-amber-950" : i === 1 ? "bg-slate-300 text-slate-800" : i === 2 ? "bg-orange-500 text-orange-950" : "bg-white/10 text-slate-300"
                )}>{i + 1}</span>
                <Avatar linha={s} tamanho="h-8 w-8" anel="bg-white/20" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-bold">{s.nome}</p>
                    <p className="text-xs text-slate-400">meta {s.metaDiaria.toFixed(1).replace(".", ",")}/dia</p>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                      style={{ width: `${Math.min(100, (s.streak / maiorStreak) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="chama-viva shrink-0 text-sm" style={{ animation: s.streak > 0 ? "chama 1.4s ease-in-out infinite" : undefined }}>
                  {s.streak > 0 ? "🔥".repeat(Math.min(s.streak, 5)) : "—"}
                </span>
                <span className="w-5 text-right text-lg font-black tabular-nums">{s.streak}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-500">Dias úteis seguidos batendo a meta diária individual.</p>
        </section>

        {/* ---------- conquistas ---------- */}
        <section className="anim-subir rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="mb-3 text-sm font-black tracking-wide text-amber-300">🏆 CONQUISTAS EM DESTAQUE</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-amber-400/30 bg-gradient-to-b from-amber-500/15 to-transparent p-3 text-center">
              <p className="text-2xl">🏅</p>
              <p className="mt-1 text-[11px] font-bold leading-tight">PRIMEIRA A BATER A META DO MÊS</p>
              <p className="mt-1 truncate text-xs text-amber-200">{b.primeiraMeta ? b.primeiraMeta.nome : "em disputa…"}</p>
              <p className="mt-1 inline-block rounded bg-fuchsia-500/25 px-1.5 text-[9px] font-black text-fuchsia-300">ÉPICA</p>
            </div>
            <div className="rounded-xl border border-sky-400/30 bg-gradient-to-b from-sky-500/15 to-transparent p-3 text-center">
              <p className="text-2xl">💎</p>
              <p className="mt-1 text-[11px] font-bold leading-tight">MAIOR TICKET MÉDIO</p>
              <p className="mt-1 truncate text-xs text-sky-200">
                {b.maiorTicket ? `${b.maiorTicket.nome} · ${formatarMoeda(b.maiorTicket.valor)}` : "mín. 5 vendas"}
              </p>
              <p className="mt-1 inline-block rounded bg-sky-500/25 px-1.5 text-[9px] font-black text-sky-300">RARA</p>
            </div>
            <div className="rounded-xl border border-rose-400/30 bg-gradient-to-b from-rose-500/15 to-transparent p-3 text-center">
              <p className="text-2xl">🎯</p>
              <p className="mt-1 text-[11px] font-bold leading-tight">MELHOR CONVERSÃO REAL (CRM)</p>
              <p className="mt-1 truncate text-xs text-rose-200">
                {b.melhorConversao ? `${b.melhorConversao.nome} · ${b.melhorConversao.taxa.toFixed(0)}%` : "sem fechamentos ainda"}
              </p>
              <p className="mt-1 inline-block rounded bg-fuchsia-500/25 px-1.5 text-[9px] font-black text-fuchsia-300">ÉPICA</p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-gradient-to-b from-emerald-500/15 to-transparent p-3 text-center">
              <p className="text-2xl">🚀</p>
              <p className="mt-1 text-[11px] font-bold leading-tight">RECORDE PESSOAL EM ANDAMENTO</p>
              <p className="mt-1 truncate text-xs text-emerald-200">
                {b.recordePessoal[0]
                  ? `${b.recordePessoal[0].nome} · ${b.recordePessoal[0].vendas} (antes ${b.recordePessoal[0].recordeAnterior})`
                  : "ninguém ainda"}
              </p>
              <p className="mt-1 inline-block rounded bg-emerald-500/25 px-1.5 text-[9px] font-black text-emerald-300">COMUM</p>
            </div>
          </div>
        </section>

        {/* ---------- desafio do dia ---------- */}
        {dados.desafioDia && (
          <section className="anim-subir rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-black tracking-wide text-rose-300">🎯 DESAFIO DO DIA</h2>
              <span className="text-xs font-bold text-slate-400">equipe toda</span>
            </div>
            <p className="text-sm font-bold">
              FECHE {dados.desafioDia.alvo} VENDA{dados.desafioDia.alvo > 1 ? "S" : ""} HOJE
            </p>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    dados.desafioDia.progresso >= dados.desafioDia.alvo
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                      : "bg-gradient-to-r from-lime-400 to-emerald-500"
                  )}
                  style={{
                    width: `${Math.min(100, (dados.desafioDia.progresso / dados.desafioDia.alvo) * 100)}%`,
                  }}
                />
              </div>
              <span className="text-sm font-black tabular-nums">
                {dados.desafioDia.progresso} / {dados.desafioDia.alvo}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              RECOMPENSA <span className="font-black text-amber-300">🪙 {dados.desafioDia.recompensaPts} pts</span>
              {dados.desafioDia.progresso >= dados.desafioDia.alvo && (
                <span className="ml-2 font-black text-emerald-400">✔ DESAFIO CUMPRIDO!</span>
              )}
            </p>
          </section>
        )}

        {/* ---------- rodapé ---------- */}
        <footer className="anim-subir mb-2 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <div>
            <p className="text-[10px] font-bold tracking-wider text-slate-400">📈 TOTAL {ROTULO[periodo]}</p>
            <p className="text-lg font-black tabular-nums text-emerald-400">{formatarMoeda(totais.receita)}</p>
            <p className="text-[10px] text-slate-400">
              {totais.variacaoPct !== null ? (
                <span className={totais.variacaoPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {totais.variacaoPct >= 0 ? "+" : ""}
                  {totais.variacaoPct.toFixed(1).replace(".", ",")}% vs anterior
                </span>
              ) : (
                `${totais.vendas} vendas`
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider text-slate-400">👥 VENDEDORAS ATIVAS</p>
            <p className="text-lg font-black tabular-nums text-sky-300">{totais.ativas}</p>
            <p className="text-[10px] text-slate-400">de {totais.totalVendedoras} no time</p>
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider text-slate-400">🏷️ MAIOR TICKET MÉDIO</p>
            <p className="text-lg font-black tabular-nums text-fuchsia-300">
              {b.maiorTicket ? formatarMoeda(b.maiorTicket.valor) : "—"}
            </p>
            <p className="truncate text-[10px] text-slate-400">{b.maiorTicket?.nome ?? "mín. 5 vendas"}</p>
          </div>
        </footer>
      </div>
    </main>
  );
}
