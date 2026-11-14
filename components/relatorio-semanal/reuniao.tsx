"use client";

import { useEffect, useRef, useState } from "react";
import { salvarCampoReuniao } from "@/app/(app)/relatorios/acoes";

/**
 * Campos da reunião de segunda (como no modelo): cada campo se salva sozinho
 * no relatório, um instante depois de parar de digitar. Os botões de copiar
 * leem os campos da página pelo atributo data-campo.
 */

type Situacao = "salvando" | "salvo" | "erro" | null;
const avisos = new Set<(s: Situacao) => void>();
const avisar = (s: Situacao) => avisos.forEach((f) => f(s));

function useSalvar(id: string, campo: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef<string | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (valor: string) => {
    avisar("salvando");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (ultimo.current === valor) return avisar("salvo");
      const r = await salvarCampoReuniao(id, campo, valor).catch(() => ({ erro: "falhou" }));
      if (r && "erro" in r && r.erro) return avisar("erro");
      ultimo.current = valor;
      avisar("salvo");
    }, 900);
  };
}

export function CampoReuniao({
  id,
  campo,
  inicial,
  placeholder,
  podeEditar,
  tipo = "text",
  multilinha = false,
  ariaLabel,
}: {
  id: string;
  campo: string;
  inicial: string;
  placeholder?: string;
  podeEditar: boolean;
  tipo?: "text" | "date";
  multilinha?: boolean;
  ariaLabel?: string;
}) {
  const [valor, setValor] = useState(inicial);
  const salvar = useSalvar(id, campo);
  const ref = useRef<HTMLTextAreaElement>(null);
  const crescer = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 84)}px`;
  };
  useEffect(crescer, []);
  const mudar = (v: string) => {
    setValor(v);
    salvar(v);
  };
  if (multilinha) {
    return (
      <textarea
        ref={ref}
        id={campo}
        data-campo={campo}
        value={valor}
        placeholder={placeholder}
        aria-label={ariaLabel}
        readOnly={!podeEditar}
        onChange={(e) => { mudar(e.target.value); crescer(); }}
      />
    );
  }
  return (
    <input
      type={tipo}
      id={campo}
      data-campo={campo}
      value={valor}
      placeholder={placeholder}
      aria-label={ariaLabel}
      readOnly={!podeEditar}
      onChange={(e) => mudar(e.target.value)}
    />
  );
}

function SelecaoReuniao({ id, campo, inicial, podeEditar, ariaLabel }: { id: string; campo: string; inicial: string; podeEditar: boolean; ariaLabel: string }) {
  const [valor, setValor] = useState(inicial);
  const salvar = useSalvar(id, campo);
  return (
    <select
      id={campo}
      data-campo={campo}
      value={valor}
      aria-label={ariaLabel}
      disabled={!podeEditar}
      onChange={(e) => { setValor(e.target.value); salvar(e.target.value); }}
    >
      <option value="" />
      <option>Feito</option>
      <option>Parcial</option>
      <option>Não feito</option>
    </select>
  );
}

function MarcaReuniao({ id, campo, inicial, podeEditar, ariaLabel }: { id: string; campo: string; inicial: boolean; podeEditar: boolean; ariaLabel: string }) {
  const [marcado, setMarcado] = useState(inicial);
  const salvar = useSalvar(id, campo);
  return (
    <input
      type="checkbox"
      id={campo}
      data-campo={campo}
      checked={marcado}
      aria-label={ariaLabel}
      disabled={!podeEditar}
      onChange={(e) => { setMarcado(e.target.checked); salvar(e.target.checked ? "1" : ""); }}
    />
  );
}

function StatusSalvo({ extra }: { extra: string | null }) {
  const [s, setS] = useState<Situacao>(null);
  useEffect(() => {
    avisos.add(setS);
    return () => { avisos.delete(setS); };
  }, []);
  const texto = extra ?? (s === "salvando" ? "Salvando…" : s === "salvo" ? "Salvo" : s === "erro" ? "Não foi possível salvar. Confira a conexão e digite de novo." : "");
  return <span id="save-status" role="status">{texto}</span>;
}

/** valor de um campo da página (os botões de copiar leem o que está na tela) */
const campoDaTela = (campo: string) => {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-campo="${campo}"]`);
  if (!el) return "";
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked ? "1" : "";
  return el.value.trim();
};

export function PerguntasReuniao({
  id,
  semana,
  reuniao,
  combinadoAnterior,
  perguntas,
  sugestoes,
  podeEditar,
}: {
  id: string;
  semana: string;
  reuniao: Record<string, string>;
  combinadoAnterior: { acao: string; responsavel: string }[] | null;
  perguntas: { pergunta: string; contexto: string }[];
  sugestoes: string[];
  podeEditar: boolean;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const r = (k: string) => reuniao[k] ?? "";
  const LINHAS = [1, 2, 3, 4, 5];
  const fixas = [
    { campo: "a1", pergunta: "O que foi entregue contra a meta?", contexto: "Vendas, receita, assinaturas, time e origem." },
    { campo: "a2", pergunta: "Qual o motivo real do desvio?", contexto: "O que explica o número, sem desculpa." },
  ];

  const copiar = async (texto: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(ok);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let foi = false;
      try { foi = document.execCommand("copy"); } catch { foi = false; }
      document.body.removeChild(ta);
      setAviso(foi ? ok : "Não foi possível copiar. Selecione o texto manualmente.");
    }
    setTimeout(() => setAviso(null), 4000);
  };

  const copiarChecklist = () => {
    const data = campoDaTela("reuniao-data");
    const linhas = ["*Checklist da semana · Interlig*", `Paulo, combinado da nossa reunião${data ? ` de ${data.split("-").reverse().join("/")}` : ""}:`, ""];
    let algum = false;
    for (const n of LINHAS) {
      const a = campoDaTela(`p${n}a`);
      if (!a) continue;
      algum = true;
      linhas.push(`[ ] ${a}`);
      linhas.push(`    Quem: ${campoDaTela(`p${n}r`) || "definir"} · Até: ${campoDaTela(`p${n}p`) || "definir"}`);
      const prova = campoDaTela(`p${n}e`);
      if (prova) linhas.push(`    Prova: ${prova}`);
    }
    if (!algum) return setAviso("Preencha ao menos uma ação no checklist.");
    linhas.push("", "Na próxima reunião começamos por aqui: feito, parcial ou não feito.");
    copiar(linhas.join("\n"), "Checklist copiado");
  };

  const copiarRespostas = () => {
    const linhas = [`Relatório Comercial Semanal · semana de ${semana}`, ""];
    const data = campoDaTela("reuniao-data");
    const quem = campoDaTela("reuniao-quem");
    if (data) linhas.push(`Reunião: ${data.split("-").reverse().join("/")}`);
    if (quem) linhas.push(`Participantes: ${quem}`);
    const comb = LINHAS.map((n) => ({ a: campoDaTela(`w${n}a`), r: campoDaTela(`w${n}r`), s: campoDaTela(`w${n}s`), o: campoDaTela(`w${n}n`) })).filter((x) => x.a);
    if (comb.length) {
      linhas.push("", "Combinado na semana passada:");
      for (const x of comb) linhas.push(`- ${x.a} | ${x.r || "sem responsável"} | ${x.s || "sem situação"}${x.o ? ` | ${x.o}` : ""}`);
    }
    for (const q of [...fixas, ...perguntas.map((p, k) => ({ campo: `b${k + 1}`, pergunta: p.pergunta, contexto: p.contexto }))]) {
      const resp = campoDaTela(q.campo);
      if (resp) linhas.push("", q.pergunta, resp);
    }
    const plano = LINHAS.map((n) => ({ a: campoDaTela(`p${n}a`), r: campoDaTela(`p${n}r`), p: campoDaTela(`p${n}p`), e: campoDaTela(`p${n}e`) })).filter((x) => x.a);
    if (plano.length) {
      linhas.push("", "Ações até a próxima segunda:");
      for (const x of plano) linhas.push(`- ${x.a} | ${x.r || "sem responsável"} | ${x.p || "sem prazo"}${x.e ? ` | prova: ${x.e}` : ""}`);
    }
    for (const [k, nome] of [["base", "base"], ["esteira", "esteira"], ["retencao", "retenção"]] as const) {
      const v = campoDaTela(`r-${k}`);
      if (v) linhas.push(`Responsável (${nome}): ${v}`);
    }
    const notas = campoDaTela("notas");
    if (notas) linhas.push("", "Anotações do CEO:", notas);
    copiar(linhas.join("\n"), "Respostas copiadas");
  };

  return (
    <div className="panel">
      <div className="meeting">
        <label htmlFor="reuniao-data">
          Data da reunião
          <CampoReuniao id={id} campo="reuniao-data" tipo="date" inicial={r("reuniao-data")} podeEditar={podeEditar} />
        </label>
        <label htmlFor="reuniao-quem">
          Participantes
          <CampoReuniao id={id} campo="reuniao-quem" inicial={r("reuniao-quem")} placeholder="Quem estava na reunião" podeEditar={podeEditar} />
        </label>
      </div>

      <h3 style={{ marginTop: 18 }}>Combinado na semana passada</h3>
      <p className="muted small" style={{ margin: "4px 0 10px" }}>
        {combinadoAnterior?.length
          ? "Veio do checklist da reunião anterior. Marque o que foi feito."
          : "Não há checklist salvo da reunião anterior. Escreva aqui o combinado da última reunião, se houver."}
      </p>
      <div className="tscroll">
        <table className="plan">
          <thead>
            <tr>
              <th>Combinado</th>
              <th>Responsável</th>
              <th>Situação</th>
              <th>Observação</th>
            </tr>
          </thead>
          <tbody>
            {LINHAS.map((n) => (
              <tr key={n}>
                <td><CampoReuniao id={id} campo={`w${n}a`} inicial={r(`w${n}a`) || combinadoAnterior?.[n - 1]?.acao || ""} podeEditar={podeEditar} ariaLabel={`Combinado ${n}`} /></td>
                <td><CampoReuniao id={id} campo={`w${n}r`} inicial={r(`w${n}r`) || combinadoAnterior?.[n - 1]?.responsavel || ""} podeEditar={podeEditar} ariaLabel={`Responsável do combinado ${n}`} /></td>
                <td><SelecaoReuniao id={id} campo={`w${n}s`} inicial={r(`w${n}s`)} podeEditar={podeEditar} ariaLabel={`Situação do combinado ${n}`} /></td>
                <td><CampoReuniao id={id} campo={`w${n}n`} inicial={r(`w${n}n`)} podeEditar={podeEditar} ariaLabel={`Observação do combinado ${n}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ marginTop: 22 }}>Perguntas fixas, toda semana</h3>
      {fixas.map((q) => (
        <div key={q.campo} className="q">
          <label htmlFor={q.campo}>
            {q.pergunta}
            <small>{q.contexto}</small>
          </label>
          <CampoReuniao id={id} campo={q.campo} inicial={r(q.campo)} placeholder="Resposta do diretor comercial" podeEditar={podeEditar} multilinha />
        </div>
      ))}

      <div className="q">
        <label htmlFor="p1a">
          Checklist do Paulo para a próxima segunda
          <small>Preencha na reunião. Máximo de 5 itens, cada um com responsável, prazo e prova. Depois copie e mande para o Paulo.</small>
        </label>
        {sugestoes.length > 0 && (
          <div className="sugg">
            <b className="small">Sugestões tiradas deste relatório</b>
            <ul className="small">
              {sugestoes.slice(0, 5).map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="tscroll">
          <table className="plan">
            <thead>
              <tr>
                <th className="chk">Feito</th>
                <th>Ação</th>
                <th>Responsável</th>
                <th>Prazo</th>
                <th>Prova de que foi feito</th>
              </tr>
            </thead>
            <tbody>
              {LINHAS.map((n) => (
                <tr key={n}>
                  <td className="chk"><MarcaReuniao id={id} campo={`c${n}`} inicial={r(`c${n}`) === "1"} podeEditar={podeEditar} ariaLabel={`Ação ${n} feita`} /></td>
                  <td><CampoReuniao id={id} campo={`p${n}a`} inicial={r(`p${n}a`)} podeEditar={podeEditar} ariaLabel={`Ação ${n}`} /></td>
                  <td><CampoReuniao id={id} campo={`p${n}r`} inicial={r(`p${n}r`)} podeEditar={podeEditar} ariaLabel={`Responsável da ação ${n}`} /></td>
                  <td><CampoReuniao id={id} campo={`p${n}p`} inicial={r(`p${n}p`)} placeholder={n === 1 ? "ex.: quarta 11/11" : undefined} podeEditar={podeEditar} ariaLabel={`Prazo da ação ${n}`} /></td>
                  <td><CampoReuniao id={id} campo={`p${n}e`} inicial={r(`p${n}e`)} placeholder={n === 1 ? "ex.: lista nominal enviada" : undefined} podeEditar={podeEditar} ariaLabel={`Prova da ação ${n}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {perguntas.length > 0 && <h3 style={{ marginTop: 22 }}>Perguntas desta semana</h3>}
      {perguntas.map((p, k) => (
        <div key={k} className="q">
          <label htmlFor={`b${k + 1}`}>
            {p.pergunta}
            <small>{p.contexto}</small>
          </label>
          <CampoReuniao id={id} campo={`b${k + 1}`} inicial={r(`b${k + 1}`)} podeEditar={podeEditar} multilinha />
        </div>
      ))}

      <div className="q">
        <label htmlFor="notas">
          Anotações do CEO
          <small>Decisões, combinados e pontos para a próxima semana.</small>
        </label>
        <CampoReuniao id={id} campo="notas" inicial={r("notas")} podeEditar={podeEditar} multilinha />
      </div>

      <div className="btnrow">
        <button type="button" className="btn" onClick={copiarChecklist}>Copiar checklist para o Paulo</button>
        <button type="button" className="btn btn-2" onClick={copiarRespostas}>Copiar respostas</button>
        <StatusSalvo extra={aviso} />
      </div>
    </div>
  );
}
