import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app creates its own tables on first run, so the schema file must ship with the server.
  outputFileTracingIncludes: { '/api/**': ['./db/schema.sql'] },
};

export default nextConfig;
