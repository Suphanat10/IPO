import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   allowedDevOrigins: ['ungenerous-nonpulmonary-tama.ngrok-free.dev'],

   // Emit a self-contained .next/standalone server (minimal node_modules) for
   // a lean production Docker image — see Dockerfile.
   output: "standalone",
};

export default nextConfig;
