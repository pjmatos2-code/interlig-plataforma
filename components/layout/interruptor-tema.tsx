"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Interruptor de parede que acende e apaga as luzes da plataforma
 * (modo claro / modo escuro). O tema vive em <html data-tema="escuro">,
 * é lembrado no navegador e aplicado antes da primeira pintura pelo script
 * do layout raiz (`SCRIPT_TEMA`). As cores ficam em app/tema-escuro.css.
 */
export const CHAVE_TEMA = "interlig-tema";

/** roda no <body> antes de tudo, para a tela não piscar clara ao abrir */
export const SCRIPT_TEMA = `try{if(localStorage.getItem("${CHAVE_TEMA}")==="escuro")document.documentElement.dataset.tema="escuro"}catch(e){}`;

export function InterruptorTema() {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => {
    setEscuro(document.documentElement.dataset.tema === "escuro");
  }, []);

  function alternar() {
    const novo = !escuro;
    const raiz = document.documentElement;
    // a transição de cores só existe durante a troca (não pesa no uso normal)
    raiz.classList.add("tema-trocando");
    if (novo) raiz.dataset.tema = "escuro";
    else delete raiz.dataset.tema;
    try {
      localStorage.setItem(CHAVE_TEMA, novo ? "escuro" : "claro");
    } catch {
      // navegador sem armazenamento: o tema vale só até recarregar
    }
    setEscuro(novo);
    window.setTimeout(() => raiz.classList.remove("tema-trocando"), 260);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={escuro}
      aria-label="Modo escuro"
      title={escuro ? "Acender as luzes, ativar modo claro" : "Apagar as luzes, ativar modo escuro"}
      onClick={alternar}
      className="interruptor-botao"
    >
      {/* a posição da tecla vem do <html data-tema> (CSS), para já nascer certa */}
      <span className="interruptor" aria-hidden="true">
        <span className="interruptor-tecla">
          <span className="interruptor-metade interruptor-sol">
            <Sun className="h-3 w-3" strokeWidth={2.25} />
          </span>
          <span className="interruptor-metade interruptor-lua">
            <Moon className="h-3 w-3" strokeWidth={2.25} />
          </span>
        </span>
      </span>
    </button>
  );
}
