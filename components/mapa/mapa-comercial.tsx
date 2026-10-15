"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polygon, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Expand, Info, Layers, MapPin, Minimize, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BairroMapa, MapaComercial as Dados, Ponto } from "@/lib/mapa/comercial";

type Aba = "instalacoes" | "base";

const GRADIENTE = { 0.25: "#d7f0dc", 0.45: "#9fdcae", 0.65: "#4fbf72", 0.85: "#1f9a4a", 1: "#0b5e2c" };
const num = (v: number) => v.toLocaleString("pt-BR");

/** mancha de calor (leaflet.heat precisa do L global) */
function CamadaCalor({ pontos, aba }: { pontos: Ponto[]; aba: Aba }) {
  const map = useMap();
  const camada = useRef<L.Layer | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.heat");
      if (!vivo) return;
      // base ativa tem milhares de casas: cada uma pesa pouco para a mancha
      // mostrar concentração (e não um tapete); instalações são poucas e
      // cada uma precisa aparecer
      const peso = aba === "base" ? 0.12 : 1;
      const heat = (L as unknown as { heatLayer: (p: [number, number, number][], o: Record<string, unknown>) => L.Layer }).heatLayer(
        pontos.map((p) => [p[0], p[1], peso] as [number, number, number]),
        {
          radius: aba === "base" ? 16 : 24,
          blur: 18,
          minOpacity: aba === "base" ? 0.05 : 0.35,
          maxZoom: 15,
          max: aba === "base" ? 1 : 0.5,
          gradient: GRADIENTE,
        }
      );
      camada.current?.remove();
      camada.current = heat.addTo(map);
    })();
    return () => {
      vivo = false;
      camada.current?.remove();
      camada.current = null;
    };
  }, [map, pontos, aba]);
  return null;
}

function Enquadrar({ alvo }: { alvo: Ponto | null }) {
  const map = useMap();
  useEffect(() => {
    if (alvo) map.flyTo(alvo, Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [alvo, map]);
  return null;
}

function AjustarTamanho({ cheio }: { cheio: boolean }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [cheio, map]);
  return null;
}

export function MapaComercial({ dados, rotuloPeriodo }: { dados: Dados; rotuloPeriodo: string }) {
  const [aba, setAba] = useState<Aba>("instalacoes");
  const [limites, setLimites] = useState(true);
  const [individuais, setIndividuais] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<Ponto | null>(null);
  const [busca, setBusca] = useState("");
  const [cheio, setCheio] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = () => setCheio(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const pontos = aba === "instalacoes" ? dados.instalacoes : dados.base;
  const metrica = (b: BairroMapa) => (aba === "instalacoes" ? b.instalacoes : b.ativos);
  const ranking = useMemo(
    () => [...dados.bairros].filter((b) => metrica(b) > 0).sort((a, b) => metrica(b) - metrica(a)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.bairros, aba]
  );
  const rotulados = new Set(ranking.slice(0, 10).map((b) => b.chave));
  const bairroSel = dados.bairros.find((b) => b.chave === sel) ?? null;
  const escolher = (b: BairroMapa) => {
    setSel(b.chave);
    setAlvo(b.centro);
  };
  const filtrados = busca ? dados.bairros.filter((b) => b.nome.toLowerCase().includes(busca.toLowerCase())).slice(0, 8) : [];
  const pctLocal = dados.cobertura.ativos ? Math.round((dados.cobertura.comLocalizacao / dados.cobertura.ativos) * 100) : 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <style>{`.rotulo-bairro{background:transparent;border:0;box-shadow:none;font-weight:600;font-size:12px;color:#0A1638;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}.rotulo-bairro:before{display:none}.fundo-claro{filter:grayscale(1) brightness(1.06) contrast(0.88)}`}</style>
      <div ref={caixa} className={cn("relative overflow-hidden rounded-xl border bg-card shadow-sm", cheio ? "h-screen" : "h-[460px] sm:h-[600px]")}>
        <MapContainer center={dados.centro} zoom={13} zoomControl={false} preferCanvas style={{ height: "100%", width: "100%" }}>
          <TileLayer
            className="fundo-claro"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="topright" />
          <CamadaCalor pontos={pontos} aba={aba} />
          <Enquadrar alvo={alvo} />
          <AjustarTamanho cheio={cheio} />
          {limites &&
            dados.bairros
              .filter((b) => b.contorno.length >= 3)
              .map((b) => (
                <Polygon
                  key={b.chave}
                  positions={b.contorno}
                  eventHandlers={{ click: () => escolher(b) }}
                  pathOptions={{
                    color: b.chave === sel ? "#043792" : "#5b7bb0",
                    weight: b.chave === sel ? 2.5 : 1.2,
                    opacity: b.chave === sel ? 1 : 0.85,
                    dashArray: b.chave === sel ? undefined : "4 6",
                    fillColor: "#047CDD",
                    fillOpacity: b.chave === sel ? 0.08 : 0,
                  }}
                >
                  {(rotulados.has(b.chave) || b.chave === sel) && (
                    <Tooltip permanent direction="center" className="rotulo-bairro">
                      {b.nome}
                    </Tooltip>
                  )}
                </Polygon>
              ))}
          {individuais &&
            pontos.map((p, i) => (
              <CircleMarker key={i} center={p} radius={2} pathOptions={{ color: "#0b5e2c", weight: 0, fillOpacity: 0.7 }} />
            ))}
        </MapContainer>

        {/* abas */}
        <div className="absolute left-3 top-3 z-[1000] flex rounded-lg border bg-card p-1 shadow-sm">
          {(
            [
              ["instalacoes", "Calor de instalações"],
              ["base", "Base ativa"],
            ] as [Aba, string][]
          ).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => setAba(k)}
              className={cn("rounded-md px-3 py-1.5 text-xs font-semibold sm:text-sm", aba === k ? "bg-interlig-azul text-white" : "text-muted-foreground hover:text-foreground")}
            >
              {r}
            </button>
          ))}
          <span className="hidden cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground/50 sm:inline" title="Fase 2: depende do potencial do bairro">
            Oportunidades
          </span>
        </div>

        {/* tela cheia */}
        <button
          type="button"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : caixa.current?.requestFullscreen())}
          title={cheio ? "Sair da tela cheia" : "Tela cheia"}
          className="absolute right-3 top-[86px] z-[1000] flex h-[30px] w-[30px] items-center justify-center rounded border-2 border-black/20 bg-white hover:bg-neutral-100"
        >
          {cheio ? <Minimize className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
        </button>

        {/* legenda */}
        <div className="absolute bottom-3 left-3 z-[1000] hidden w-56 rounded-lg border bg-card/95 p-3 text-xs shadow-sm sm:block">
          <p className="font-semibold">{aba === "instalacoes" ? `Instalações · ${rotuloPeriodo}` : "Clientes ativos"}</p>
          <span className="mt-2 block h-2.5 rounded-full" style={{ background: "linear-gradient(90deg,#d7f0dc,#9fdcae,#4fbf72,#1f9a4a,#0b5e2c)" }} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Menor concentração</span>
            <span>Maior</span>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">{num(pontos.length)} pontos no mapa</p>
        </div>

        {/* camadas */}
        <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-1.5 rounded-lg border bg-card/95 p-2.5 text-xs shadow-sm sm:flex-row sm:items-center sm:gap-4">
          <Layers className="hidden h-4 w-4 text-muted-foreground sm:block" />
          {(
            [
              ["Limites dos bairros", limites, setLimites],
              ["Pontos individuais", individuais, setIndividuais],
            ] as [string, boolean, (v: boolean) => void][]
          ).map(([r, v, set]) => (
            <label key={r} className="flex cursor-pointer items-center gap-2">
              <span>{r}</span>
              <button
                type="button"
                role="switch"
                aria-checked={v}
                onClick={() => set(!v)}
                className={cn("relative h-5 w-9 rounded-full transition-colors", v ? "bg-interlig-azul" : "bg-muted-foreground/30")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", v ? "left-[18px]" : "left-0.5")} />
              </button>
            </label>
          ))}
        </div>
      </div>

      {/* painel */}
      <aside className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar bairro"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm"
          />
          {filtrados.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
              {filtrados.map((b) => (
                <li key={b.chave}>
                  <button type="button" onClick={() => { escolher(b); setBusca(""); }} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span className="truncate">{b.nome}</span>
                    <span className="text-xs text-muted-foreground">{b.cidade}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {bairroSel ? (
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bairro</p>
                <h3 className="break-words text-2xl font-bold leading-tight">{bairroSel.nome}</h3>
                <p className="text-sm text-muted-foreground">{bairroSel.cidade}</p>
              </div>
              <button type="button" onClick={() => setSel(null)} title="Fechar" className="rounded-md p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 divide-y text-sm">
              {(
                [
                  ["Clientes ativos", bairroSel.ativos, null],
                  [`Instalações (${rotuloPeriodo})`, bairroSel.instalacoes, "text-farol-verde"],
                  [`Vendas (${rotuloPeriodo})`, bairroSel.vendas, null],
                  [`Cancelamentos (${rotuloPeriodo})`, bairroSel.cancelamentos, bairroSel.cancelamentos > 0 ? "text-farol-vermelho" : null],
                  ["Saldo do período", bairroSel.instalacoes - bairroSel.cancelamentos, bairroSel.instalacoes - bairroSel.cancelamentos >= 0 ? "text-farol-verde" : "text-farol-vermelho"],
                  ["Suspensos hoje", bairroSel.suspensos, bairroSel.suspensos > 0 ? "text-amber-700" : null],
                ] as [string, number, string | null][]
              ).map(([r, v, cor]) => (
                <div key={r} className="flex items-center justify-between py-2.5">
                  <dt className="text-muted-foreground">{r}</dt>
                  <dd className={cn("text-xl font-bold tabular-nums", cor)}>{v > 0 && r === "Saldo do período" ? `+${num(v)}` : num(v)}</dd>
                </div>
              ))}
            </dl>
            {bairroSel.semLocalizacao > 0 && (
              <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" /> {num(bairroSel.semLocalizacao)} cliente(s) ativo(s) do bairro sem localização no SGP ficam fora da mancha.
              </p>
            )}
            <div className="mt-4 flex gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
              <Info className="h-4 w-4 shrink-0" />
              <span>Potencial do bairro (imóveis atendíveis e penetração) entra na fase 2, com a fonte de dados a definir.</span>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold">{aba === "instalacoes" ? `Bairros com mais instalações · ${rotuloPeriodo}` : "Bairros com mais clientes ativos"}</p>
            <p className="mb-3 text-xs text-muted-foreground">Clique num bairro (aqui ou no mapa) para ver os números.</p>
            <ol className="space-y-1">
              {ranking.slice(0, 12).map((b, i) => {
                const max = metrica(ranking[0]) || 1;
                return (
                  <li key={b.chave}>
                    <button type="button" onClick={() => escolher(b)} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-muted">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                          {b.nome}
                        </span>
                        <span className="font-semibold tabular-nums">{num(metrica(b))}</span>
                      </div>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-farol-verde" style={{ width: `${(metrica(b) / max) * 100}%` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
              {ranking.length === 0 && <li className="text-sm text-muted-foreground">Sem dados no período.</li>}
            </ol>
          </div>
        )}
        <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">
          {pctLocal}% dos clientes ativos têm localização no SGP ({num(dados.cobertura.comLocalizacao)} de {num(dados.cobertura.ativos)}). Limites dos bairros são aproximados, traçados pelas casas dos clientes.
        </p>
      </aside>
    </div>
  );
}
