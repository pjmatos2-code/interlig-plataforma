#!/usr/bin/env python3
"""Gera app/tema-escuro.css — o modo escuro da plataforma num arquivo só.

Uso (na raiz do projeto):  python3 scripts/gerar-tema-escuro.py

Como funciona
- O tema vale só dentro do AppShell (classe .tema-app) quando o <html> tem
  data-tema="escuro". Login, modo TV, apresentações e PDFs não mudam.
- Parte fixa: variáveis de cor (as mesmas do globals.css, em versão escura),
  cabeçalho/menu, gráficos (Recharts) e a transição ao trocar de tema.
- Parte gerada: o projeto tem cores claras escritas direto nas telas
  (bg-white, text-slate-700, bg-amber-100...). Este script procura essas
  classes no código e escreve o equivalente escuro de cada uma, com
  especificidade baixa — um `dark:` posto na tela sempre ganha.
- Rode de novo quando uma tela nova usar uma cor fixa que ficou clara demais
  no modo escuro.
"""
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "app" / "tema-escuro.css"
ESCOPO = ':where([data-tema="escuro"] .tema-app)'

# paleta aprovada (26/11/2026)
FUNDO, CHROME, CARD, ELEVADO, BORDA = "#0B111B", "#101B2A", "#1D2B3D", "#293B51", "#35485D"
TEXTO, TEXTO2, TEXTO3 = "#F1F5F9", "#B8C4D5", "#8FA0B5"
BOTAO, BOTAO_HOVER, AZUL_CLARO, AZUL_MEDIO = "#2563A8", "#2A6DB8", "#95BCE2", "#4A8BCB"

NEUTRAS = {"slate", "gray", "zinc", "neutral", "stone"}
# família -> (fundo 50/100, fundo 200 e hover, texto, borda)
FAMILIAS = {}
for nomes, cores in [
    (("sky", "blue", "cyan"), ("#17344F", "#1E4263", "#9CCBF3", "#2C5C86")),
    (("indigo", "violet", "purple", "fuchsia"), ("#2B2850", "#37336A", "#C3BBF7", "#4B4690")),
    (("amber", "yellow"), ("#3D2F14", "#4D3B18", "#F5C56B", "#7A5A1C")),
    (("orange",), ("#40280F", "#523313", "#F7AD6B", "#7A4A1C")),
    (("red", "rose", "pink"), ("#40202A", "#522834", "#F59AA6", "#7A3442")),
    (("green", "emerald", "lime"), ("#163828", "#1C4733", "#6FD6A0", "#2C6B4C")),
    (("teal",), ("#12383A", "#17474A", "#7FD6CB", "#27696C")),
]:
    for n in nomes:
        FAMILIAS[n] = cores

CORES = "white|black|" + "|".join(sorted(NEUTRAS | set(FAMILIAS))) + "|interlig-azul|interlig-ceu|interlig-marinho"
PADRAO = re.compile(
    r"(?<![\w:/\-\[])((?:hover|focus|active|group-hover):)?"
    r"(bg|text|border|divide|from|via|to)-(" + CORES + r")(?:-(\d{2,3}))?(?:/(\d{1,3}))?(?![\w\-/\[])"
)


def cor_escura(prop, cor, tom, alfa, variante):
    """devolve a cor escura equivalente, ou None para deixar como está"""
    tom = int(tom) if tom else None
    alfa = int(alfa) if alfa else 100
    hover = variante in ("hover", "active", "group-hover")
    if prop in ("bg", "from", "via", "to"):
        if cor == "white":
            if alfa < 40:
                return None  # véu sobre superfície escura (cabeçalho, TV)
            return ELEVADO if hover else CARD
        if cor in NEUTRAS:
            if tom == 50:
                return ELEVADO if hover else "#223247"
            if tom == 100:
                return "#30445C" if hover else ELEVADO
            if tom == 200:
                return BORDA
            if tom == 300:
                return "#4A607A"
            return None
        if cor in FAMILIAS and tom in (50, 100, 200):
            f = FAMILIAS[cor]
            return f[1] if (hover or tom == 200) else f[0]
        if cor == "interlig-azul":
            if alfa <= 25:
                return "#22364F"
            return BOTAO_HOVER if (hover or alfa < 100) else BOTAO
        if cor == "interlig-ceu" and alfa <= 25:
            return "#20354D"
        return None
    if prop == "text":
        if cor == "black":
            return TEXTO
        if cor in NEUTRAS:
            if tom in (700, 800, 900, 950):
                return TEXTO
            if tom in (500, 600):
                return TEXTO2
            if tom == 400:
                return TEXTO3
            return None
        if cor in FAMILIAS and tom in (600, 700, 800, 900) and alfa == 100:
            return FAMILIAS[cor][2]
        if cor == "interlig-azul":
            return AZUL_CLARO
        if cor == "interlig-marinho":
            return TEXTO
        if cor == "interlig-ceu":
            return "#6FB1EE"
        return None
    if prop in ("border", "divide"):
        if cor == "black" and alfa <= 25:
            return BORDA
        if cor in NEUTRAS:
            if tom in (100, 200, 300):
                return BORDA
            if tom == 400:
                return "#4A607A"
            return None
        if cor in FAMILIAS and tom in (100, 200, 300):
            return FAMILIAS[cor][3]
        if cor == "interlig-azul":
            return AZUL_MEDIO
        return None
    return None


def escapar(classe):
    return re.sub(r"([:/\[\]#.%])", r"\\\1", classe)


def regra(classe, variante, prop, cor):
    sel = "." + escapar(classe)
    if variante == "hover":
        sel += ":hover"
    elif variante == "focus":
        sel += ":focus"
    elif variante == "active":
        sel += ":active"
    elif variante == "group-hover":
        sel = ".group:hover " + sel
    if prop == "divide":
        sel += " > :not([hidden]) ~ :not([hidden])"
    corpo = {
        "bg": f"background-color: {cor}",
        "text": f"color: {cor}",
        "border": f"border-color: {cor}",
        "divide": f"border-color: {cor}",
        "from": f"--tw-gradient-from: {cor} var(--tw-gradient-from-position)",
        "to": f"--tw-gradient-to: {cor} var(--tw-gradient-to-position)",
        "via": f"--tw-gradient-stops: var(--tw-gradient-from), {cor} var(--tw-gradient-via-position), var(--tw-gradient-to)",
    }[prop]
    return f"{ESCOPO} {sel} {{ {corpo}; }}"


def classes_do_projeto():
    achadas = {}
    for pasta in ("app", "components", "lib"):
        for arq in (RAIZ / pasta).rglob("*.ts*"):
            partes = arq.relative_to(RAIZ).parts
            # fora do AppShell: não entram no tema
            if "tv" in partes[:2] or "(apresentacao)" in partes or "login" in partes[:2]:
                continue
            for m in PADRAO.finditer(arq.read_text(encoding="utf-8")):
                variante = (m.group(1) or "").rstrip(":")
                achadas[m.group(0)] = (variante, m.group(2), m.group(3), m.group(4), m.group(5))
    return achadas


FIXO = f"""/* GERADO por scripts/gerar-tema-escuro.py — não editar à mão. */

/* ---------- fundo da página (só onde existe o AppShell) ---------- */
html[data-tema="escuro"]:has(.tema-app),
html[data-tema="escuro"]:has(.tema-app) body {{
  background-color: {FUNDO};
  color-scheme: dark;
}}

/* ---------- variáveis: as mesmas do globals.css, versão escura ---------- */
[data-tema="escuro"] .tema-app {{
  --background: 218 42% 7%;
  --foreground: 210 40% 96%;
  --card: 214 36% 18%;
  --card-foreground: 210 40% 96%;
  --primary: 212 64% 40%;
  --primary-foreground: 0 0% 100%;
  --secondary: 213 33% 24%;
  --secondary-foreground: 210 40% 96%;
  --muted: 213 33% 24%;
  --muted-foreground: 215 26% 78%;
  --accent: 213 33% 24%;
  --accent-foreground: 210 40% 96%;
  --destructive: 0 70% 55%;
  --destructive-foreground: 0 0% 100%;
  --border: 212 27% 29%;
  --input: 212 27% 29%;
  --ring: 210 55% 54%;
  --vazio: {ELEVADO}; /* anel de gráfico sem dados */
  background-color: {FUNDO};
  color: {TEXTO};
  color-scheme: dark;
}}

/* ---------- cabeçalho e menu lateral ---------- */
[data-tema="escuro"] .tema-app .tema-topo,
[data-tema="escuro"] .tema-app .tema-menu {{ background-color: {CHROME}; border-color: {BORDA}; }}
[data-tema="escuro"] .tema-app .tema-menu-ativo {{ background-color: #1C4F85; color: #fff; }}

/* ---------- textos que usam variável e ficariam apagados ---------- */
{ESCOPO} .text-primary {{ color: {AZUL_CLARO}; }}
{ESCOPO} .text-destructive {{ color: #F59AA6; }}
{ESCOPO} .text-farol-verde {{ color: #5CCB8E; }}
{ESCOPO} .text-farol-vermelho {{ color: #F28B8B; }}
{ESCOPO} .border-primary {{ border-color: {AZUL_MEDIO}; }}

/* ---------- gráficos (Recharts) ---------- */
[data-tema="escuro"] .tema-app .recharts-cartesian-grid line {{ stroke: {BORDA}; }}
[data-tema="escuro"] .tema-app .recharts-cartesian-axis-line,
[data-tema="escuro"] .tema-app .recharts-cartesian-axis-tick-line {{ stroke: #4A607A; }}
[data-tema="escuro"] .tema-app .recharts-text,
[data-tema="escuro"] .tema-app .recharts-label,
[data-tema="escuro"] .tema-app .recharts-label-list text {{ fill: {TEXTO2} !important; }}
[data-tema="escuro"] .tema-app .recharts-wrapper [stroke="#043792"] {{ stroke: {AZUL_CLARO}; }}
[data-tema="escuro"] .tema-app .recharts-wrapper [fill="#043792"],
[data-tema="escuro"] .tema-app .recharts-wrapper [fill="#047CDD"],
[data-tema="escuro"] .tema-app .recharts-wrapper [fill="#1D5FD1"] {{ fill: #2F6CAB; }}
[data-tema="escuro"] .tema-app .recharts-wrapper [stroke="#1D5FD1"] {{ stroke: #5E9BD8; }}
[data-tema="escuro"] .tema-app .recharts-wrapper [stroke="#ffffff"] {{ stroke: {CARD}; }}
[data-tema="escuro"] .tema-app .recharts-tooltip-cursor {{ fill: {ELEVADO}; }}

/* ---------- acender e apagar: transição curta só na troca ---------- */
html.tema-trocando .tema-app,
html.tema-trocando .tema-app *:not(.interruptor-tecla):not(.interruptor-tecla *) {{
  transition: background-color 200ms ease, color 200ms ease, border-color 200ms ease, fill 200ms ease, stroke 200ms ease !important;
}}
@media (prefers-reduced-motion: reduce) {{
  html.tema-trocando .tema-app,
  html.tema-trocando .tema-app * {{ transition: none !important; }}
}}

/* ---------- cores claras escritas direto nas telas ---------- */
"""


def main():
    linhas = []
    for classe, (variante, prop, cor, tom, alfa) in sorted(classes_do_projeto().items()):
        nova = cor_escura(prop, cor, tom, alfa, variante)
        if nova:
            linhas.append(regra(classe, variante, prop, nova))
    DESTINO.write_text(FIXO + "\n".join(linhas) + "\n", encoding="utf-8")
    print(f"{DESTINO.relative_to(RAIZ)}: {len(linhas)} cores convertidas")


if __name__ == "__main__":
    main()
