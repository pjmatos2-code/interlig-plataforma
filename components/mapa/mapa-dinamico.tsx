"use client";

import dynamic from "next/dynamic";
import type { PontoBairro } from "@/lib/mapa/dados";

// Leaflet depende de window — só carrega no navegador.
const MapaCalor = dynamic(() => import("./mapa-calor").then((m) => m.MapaCalor), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border text-sm text-muted-foreground">
      Carregando o mapa…
    </div>
  ),
});

export function MapaDinamico(props: { pontos: PontoBairro[]; centro: [number, number] }) {
  return <MapaCalor {...props} />;
}
