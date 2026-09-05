import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["16labs.xyz", "www.16labs.xyz"],
};

export default nextConfig;
