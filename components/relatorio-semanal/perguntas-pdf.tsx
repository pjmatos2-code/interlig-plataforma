/**
 * Perguntas da reunião na versão impressa (o PDF do e-mail): as mesmas
 * perguntas da tela, sem campos. O que já foi respondido na plataforma
 * aparece como texto; o que falta preencher fica para a reunião.
 */

const LINHAS = [1, 2, 3, 4, 5];
const FIXAS = [
  { campo: "a1", pergunta: "O que foi entregue contra a meta?", contexto: "Vendas, receita, assinaturas, time e origem." },
  { campo: "a2", pergunta: "Qual o motivo real do desvio?", contexto: "O que explica o número, sem desculpa." },
];

function Pergunta({ pergunta, contexto, resposta }: { pergunta: string; contexto: string; resposta: string }) {
  return (
    <div className="q">
      <p className="q-t">
        {pergunta}
        <small>{contexto}</small>
      </p>
      {resposta ? <p className="resp">{resposta}</p> : null}
    </div>
  );
}

export function PerguntasPdf({
  reuniao,
  combinadoAnterior,
  perguntas,
  sugestoes,
}: {
  reuniao: Record<string, string>;
  combinadoAnterior: { acao: string; responsavel: string }[] | null;
  perguntas: { pergunta: string; contexto: string }[];
  sugestoes: string[];
}) {
  const r = (k: string) => (reuniao[k] ?? "").trim();
  const combinado = LINHAS.map((n) => ({
    acao: r(`w${n}a`) || combinadoAnterior?.[n - 1]?.acao || "",
    responsavel: r(`w${n}r`) || combinadoAnterior?.[n - 1]?.responsavel || "",
    situacao: r(`w${n}s`),
    obs: r(`w${n}n`),
  })).filter((x) => x.acao);
  const plano = LINHAS.map((n) => ({ acao: r(`p${n}a`), responsavel: r(`p${n}r`), prazo: r(`p${n}p`), prova: r(`p${n}e`), feito: r(`c${n}`) === "1" })).filter((x) => x.acao);
  const dataReuniao = r("reuniao-data");

  return (
    <div className="panel">
      {(dataReuniao || r("reuniao-quem")) && (
        <p className="small muted" style={{ marginBottom: 12 }}>
          {dataReuniao && <>Reunião de {dataReuniao.split("-").reverse().join("/")}</>}
          {dataReuniao && r("reuniao-quem") && " · "}
          {r("reuniao-quem") && <>Participantes: {r("reuniao-quem")}</>}
        </p>
      )}

      {combinado.length > 0 && (
        <>
          <h3>Combinado na semana passada</h3>
          <p className="muted small" style={{ margin: "4px 0 10px" }}>Do checklist da reunião anterior. Na reunião, marque o que foi feito.</p>
          <div className="tscroll" style={{ marginBottom: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Combinado</th>
                  <th>Responsável</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {combinado.map((x, k) => (
                  <tr key={k}>
                    <td>
                      {x.acao}
                      {x.obs && <small className="muted" style={{ display: "block" }}>{x.obs}</small>}
                    </td>
                    <td>{x.responsavel || "—"}</td>
                    <td>{x.situacao || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Perguntas fixas, toda semana</h3>
      {FIXAS.map((q) => (
        <Pergunta key={q.campo} pergunta={q.pergunta} contexto={q.contexto} resposta={r(q.campo)} />
      ))}

      {perguntas.length > 0 && <h3 style={{ marginTop: 18 }}>Perguntas desta semana</h3>}
      {perguntas.map((p, k) => (
        <Pergunta key={k} pergunta={p.pergunta} contexto={p.contexto} resposta={r(`b${k + 1}`)} />
      ))}

      <h3 style={{ marginTop: 18 }}>Checklist do Paulo para a próxima segunda</h3>
      <p className="muted small" style={{ margin: "4px 0 10px" }}>Até 5 ações, cada uma com responsável, prazo e prova de que foi feita.</p>
      {plano.length > 0 ? (
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Ação</th>
                <th>Responsável</th>
                <th>Prazo</th>
                <th>Prova</th>
              </tr>
            </thead>
            <tbody>
              {plano.map((x, k) => (
                <tr key={k}>
                  <td>
                    {x.feito && <b>Feito · </b>}
                    {x.acao}
                  </td>
                  <td>{x.responsavel || "—"}</td>
                  <td>{x.prazo || "—"}</td>
                  <td>{x.prova || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sugestoes.length > 0 ? (
        <div className="sugg">
          <b className="small">Sugestões tiradas deste relatório</b>
          <ul className="small">
            {sugestoes.slice(0, 5).map((s, k) => (
              <li key={k}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {r("notas") && (
        <>
          <h3 style={{ marginTop: 18 }}>Anotações do CEO</h3>
          <p className="resp" style={{ marginTop: 8 }}>{r("notas")}</p>
        </>
      )}
    </div>
  );
}
