"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Relógio + refresh de 15s do totem (quase tempo real, casado com o sync de 5 min). */
export function AtualizadorTotem() {
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
    const refresh = setInterval(() => router.refresh(), 15_000);
    return () => {
      clearInterval(relogio);
      clearInterval(refresh);
    };
  }, [router]);

  return <span className="tabular-nums">{agora}</span>;
}
