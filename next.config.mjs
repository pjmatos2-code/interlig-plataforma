/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // upload de foto de perfil (o padrão de 1 MB derruba fotos de celular)
      bodySizeLimit: "8mb",
    },
    // pdfjs carrega o worker por import dinâmico em runtime — empacotado
    // pelo bundler, o módulo some no serverless ("Cannot find pdf.worker.mjs")
    // puppeteer-core e @sparticuz/chromium (PDF do relatório da diretoria)
    // precisam ficar fora do bundle: o Chromium acha os próprios arquivos
    // pela pasta do pacote
    serverComponentsExternalPackages: ["pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],
    // o Chromium comprimido (bin/*.br, ~68 MB) é lido do disco em runtime e o
    // rastreador de arquivos não enxerga — entra à mão nas rotas do relatório
    outputFileTracingIncludes: {
      "/api/relatorios/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
