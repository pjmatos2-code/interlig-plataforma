"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recarrega a TV da Performance a cada 5 min (a coleta do chat e o sync do SGP também são de 5 min). */
export function AtualizarPerformanceTv() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60_000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
