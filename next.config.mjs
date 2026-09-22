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
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
};

export default nextConfig;
