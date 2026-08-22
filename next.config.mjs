/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // upload de foto de perfil (o padrão de 1 MB derruba fotos de celular)
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
