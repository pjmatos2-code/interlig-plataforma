/**
 * Cidade do cadastro do SGP → cidade atendida pela plataforma, ou null quando
 * o cadastro fica fora (outra cidade, bairro digitado no lugar da cidade…).
 *
 * O campo é texto livre no SGP e só entra na plataforma quem tem a cidade
 * reconhecida. Quando não reconhece, o cliente e os contratos dele não são
 * importados: a venda some das vendas, do ranking e da comissão, e o ticket
 * do CRM nunca reconcilia. Por isso a leitura tolera, nesta ordem:
 *
 *  1. as grafias conhecidas ("ALTAMIRA-PA", "VTX", "ALTAMIR"…) — regra de
 *     02/09/2026;
 *  2. localidade que não é município mas pertence a uma unidade: Leonardo da
 *     Vinci, também chamada de KM 18, é do POP de Vitória do Xingu;
 *  3. erro de digitação do nome da cidade ("ALTMIRA", "ALTAMITA", "NRASIL
 *     NOVO") — 18/11/2026, depois de duas vendas de novembro ficarem de fora;
 *  4. CEP ou nada no campo cidade: vale a cidade do endereço do contrato.
 *
 * Arquivo sem dependência de servidor, para ter teste.
 */

const CIDADES_ESCOPO = new Map([
  ["ALTAMIRA", "Altamira"],
  ["VITORIA DO XINGU", "Vitória do Xingu"],
  ["BRASIL NOVO", "Brasil Novo"],
]);

export const semAcento = (s: string | undefined | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** só letras, um espaço entre as palavras e sem o "PA" do fim */
const soLetras = (s: string | undefined | null) =>
  semAcento(s)
    .replace(/[^A-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ (PA|PARA)$/, "");

/**
 * Grafias conhecidas (02/09/2026). Tolera as variações que o atendimento
 * digita ("ALTAMIRA-PA", "ALTAMIRA PARA", "VITORIA DO  XINGU PA", "ALTAMIA",
 * "XINFU", "VTX"…). Um levantamento daquela data achou 111 clientes do escopo
 * excluídos do sync só pela grafia da cidade.
 */
export function cidadeEscopo(s: string | undefined | null): string | null {
  let c = soLetras(s);
  if (c === "ALTAMIA") c = "ALTAMIRA";
  if (c === "VTX" || c === "VITORIA DO XINFU") c = "VITORIA DO XINGU";
  const direto = CIDADES_ESCOPO.get(c);
  if (direto) return direto;
  // cadastro com texto livre no campo cidade ("ZONA RURAL DE VTX", "RAMAL DO
  // ALTAMIRA KM 12"…) ou truncado/errado ("ALTAMIR" — caso real 22/09):
  // reconhece a cidade CONTIDA na frase, tolerando o final comido
  if (/\bVITORIA DO XINGU\b|\bVTX\b|\bXING\w*\b/.test(c)) return "Vitória do Xingu";
  if (/\bBRASIL NOV\w*\b/.test(c)) return "Brasil Novo";
  if (/\bALTAMIRA?\b/.test(c)) return "Altamira";
  return null;
}

/** UF do Pará ou em branco: fora disso o endereço é de outro estado */
const ufDoPara = (uf: string | undefined | null) => {
  const limpa = semAcento(uf).replace(/[^A-Z]/g, "");
  return limpa === "" || limpa === "PA" || limpa === "PARA";
};

/**
 * Localidade digitada no campo cidade que pertence a uma unidade (decisão do
 * Paulo, 18/11/2026). Leonardo da Vinci e KM 18 são o mesmo lugar e contam
 * como Vitória do Xingu: o suporte de lá é feito por Altamira, mas o POP é o
 * de Vitória do Xingu, e é o POP que vale na plataforma.
 *
 * Só olha o campo cidade. Quem tem a localidade no bairro e uma cidade
 * atendida no campo cidade continua na cidade que está no cadastro.
 */
export function localidadeAtendida(cidade: string | undefined | null, uf?: string | null): string | null {
  if (!ufDoPara(uf)) return null;
  // letras e números colados: "LEONARDO D'VINCI", "LEONARDO DA VINCE", "KM-18"…
  const colado = semAcento(cidade).replace(/[^A-Z0-9]+/g, "");
  if (/LEONARDO?D?[AE]?VINC[IE]/.test(colado)) return "Vitória do Xingu";
  if (colado === "KM18") return "Vitória do Xingu";
  return null;
}

/**
 * Quantas letras é preciso trocar, tirar ou pôr para um texto virar o outro.
 * Duas letras vizinhas invertidas ("ALTMAIRA") contam uma troca só.
 */
export function distanciaEdicao(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * Quantos erros de digitação cada nome aceita. Altamira tem 8 letras e fica
 * em um erro só: com dois, "Altaneira" (CE) passaria por Altamira.
 */
const TOLERANCIA: [chave: string, cidade: string, erros: number][] = [
  ["ALTAMIRA", "Altamira", 1],
  ["BRASIL NOVO", "Brasil Novo", 2],
  ["VITORIA DO XINGU", "Vitória do Xingu", 2],
];

/**
 * Erro de digitação de uma cidade atendida. Só vale para cadastro do Pará ou
 * sem UF: com outra UF preenchida, o endereço é de fora mesmo.
 */
export function cidadeComErroDeDigitacao(
  cidade: string | undefined | null,
  uf?: string | null
): string | null {
  if (!ufDoPara(uf)) return null;
  const c = soLetras(cidade);
  if (!c) return null;
  for (const [chave, nome, erros] of TOLERANCIA) {
    if (Math.abs(c.length - chave.length) > erros) continue;
    if (distanciaEdicao(c, chave) <= erros) return nome;
  }
  return null;
}

export type EnderecoSgp = { cidade?: string | null; uf?: string | null };

/**
 * A cidade que vale para o cadastro inteiro (cliente e contratos). Null deixa
 * o cadastro fora da plataforma — ele aparece em Administração → Cadastros do
 * SGP fora da plataforma, para o gestor conferir.
 */
export function cidadeDoCadastro(cliente: {
  endereco?: EnderecoSgp | null;
  contratos?: { endereco?: EnderecoSgp | null }[] | null;
}): string | null {
  const reconhecer = (e: EnderecoSgp | null | undefined) =>
    cidadeEscopo(e?.cidade) ?? localidadeAtendida(e?.cidade, e?.uf) ?? cidadeComErroDeDigitacao(e?.cidade, e?.uf);

  const doCliente = reconhecer(cliente.endereco);
  if (doCliente) return doCliente;

  // Campo cidade vazio ou com número (o CEP digitado no lugar): o endereço do
  // contrato costuma estar certo. Só vale se todos os contratos reconhecidos
  // apontarem para a mesma cidade. Com nome de outro lugar no campo ("BRASÍLIA",
  // "BAIRRO LATICINIO") não vale: aí é endereço de fora ou bairro, e a decisão
  // é do gestor.
  const digitado = String(cliente.endereco?.cidade ?? "").trim();
  if (digitado === "" || /\d/.test(digitado)) {
    const dosContratos = new Set(
      (cliente.contratos ?? []).map((k) => reconhecer(k.endereco)).filter((c): c is string => c !== null)
    );
    if (dosContratos.size === 1) return [...dosContratos][0];
  }
  return null;
}
