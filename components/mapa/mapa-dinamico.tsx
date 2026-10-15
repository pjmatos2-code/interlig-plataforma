"use client";

import dynamic from "next/dynamic";
import type { MapaComercial as Dados } from "@/lib/mapa/comercial";

// Leaflet depende de window — só carrega no navegador.
const MapaComercial = dynamic(() => import("./mapa-comercial").then((m) => m.MapaComercial), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] items-center justify-center rounded-xl border text-sm text-muted-foreground sm:h-[600px]">
      Carregando o mapa…
    </div>
  ),
});

export function MapaDinamico(props: { dados: Dados; rotuloPeriodo: string }) {
  return <MapaComercial {...props} />;
}
