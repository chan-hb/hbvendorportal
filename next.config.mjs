/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // The vendor purchase orders page became Home. Keep the old address working.
  async redirects() {
    return [{ source: "/purchase-orders", destination: "/home", permanent: false }];
  },
};
export default nextConfig;
