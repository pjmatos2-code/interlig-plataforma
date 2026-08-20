# Arquivos oficiais da marca

Coloque aqui os arquivos originais da logomarca quando os tiver em mãos:

- `logo-fundo-escuro.png` (ou .svg) — versão branca, para o cabeçalho e o login
- `logo-fundo-claro.png` (ou .svg) — versão azul, para documentos e fundos claros

Hoje a marca é desenhada pelo componente `components/marca/logo-interlig.tsx`
(recriação vetorial fiel). Com os arquivos oficiais nesta pasta, basta trocar o
conteúdo do componente por um `<Image>` apontando para eles — nenhuma tela muda.

Paleta oficial usada na plataforma (tailwind.config.ts → cores `interlig`):

| Nome | Hex | Uso |
|---|---|---|
| marinho | `#0F1D4D` | fundo do cabeçalho e do login |
| azul | `#1D3D9A` | cor primária (botões, links, item ativo) |
| ceu | `#1E88E5` | destaques, subtítulo da marca, anel de foco |
| claro | `#7FB8F2` | detalhes e quadradinhos da marca |
