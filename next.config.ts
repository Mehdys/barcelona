import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Next.js 15: serverExternalPackages (replaces experimental.serverComponentsExternalPackages)
  // Prevents @xenova/transformers and its ONNX native bindings from being bundled by webpack
  serverExternalPackages: ['@xenova/transformers'],
}

export default nextConfig
