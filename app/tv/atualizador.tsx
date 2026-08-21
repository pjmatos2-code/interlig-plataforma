"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Auto-refresh de 60s do modo TV (PRD 3.3) + relógio. */
export function AtualizadorTv() {
  const router = useRouter();
  const [agora, setAgora] = useState<string>("");

  useEffect(() => {
    const relogio = setInterval(
      () =>
        setAgora(
          new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Santarem",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(new Date())
        ),
      1000
    );
    const refresh = setInterval(() => router.refresh(), 60_000);
    return () => {
      clearInterval(relogio);
      clearInterval(refresh);
    };
  }, [router]);

  return <span className="tabular-nums">{agora}</span>;
}
