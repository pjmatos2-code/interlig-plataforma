"use client";

import { useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PontoBairro } from "@/lib/mapa/dados";

type Camada = "vendas" | "ativos";

/** Círculos proporcionais por centroide de bairro (PRD 3.6, fallback do MVP). */
export function MapaCalor({
  pontos,
  centro,
}: {
  pontos: PontoBairro[];
  centro: [number, number];
}) {
  const [camada, setCamada] = useState<Camada>("vendas");

  const valor = (p: PontoBairro) => (camada === "vendas" ? p.vendasPeriodo : p.clientesAtivos);
  const maior = Math.max(1, ...pontos.map(valor));
  const raio = (p: PontoBairro) => 6 + Math.sqrt(valor(p) / maior) * 22;
  const cor = camada === "vendas" ? "#047CDD" : "#1baf7a";

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {(
          [
            ["vendas", "Vendas no período"],
            ["ativos", "Clientes ativos"],
          ] as [Camada, string][]
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setCamada(chave)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              camada === chave
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:border-interlig-ceu"
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border" style={{ height: "32rem" }}>
        <MapContainer center={centro} zoom={7} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pontos
            .filter((p) => valor(p) > 0)
            .map((p) => (
              <CircleMarker
                key={`${p.cidade}-${p.bairro}`}
                center={[p.lat, p.lng]}
                radius={raio(p)}
                pathOptions={{ color: cor, fillColor: cor, fillOpacity: 0.35, weight: 2 }}
              >
                <Tooltip>
                  <div className="text-xs">
                    <p className="font-semibold">
                      {p.bairro} · {p.cidade}
                    </p>
                    <p>{formatarNumero(p.vendasPeriodo)} venda(s) no período</p>
                    <p>{formatarNumero(p.clientesAtivos)} cliente(s) ativo(s)</p>
                    {p.receitaPeriodo > 0 && <p>{formatarMoeda(p.receitaPeriodo)} contratados</p>}
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}
