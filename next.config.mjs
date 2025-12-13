/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "www.goldpdv.com.br",
      },
      {
        protocol: "https",
        hostname: "*.goldpdv.com.br",
      },
      {
        protocol: "https",
        hostname: "www.nortesoft.com.br",
      },
    ],
  },
};

export default nextConfig;
