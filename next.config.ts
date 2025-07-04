import type { NextConfig } from "next";

const nextConfig: NextConfig = {
 output: 'export',
 basePath: "/quantaview",
 images: {
  unoptimized: true,
 }
};

export default nextConfig;
