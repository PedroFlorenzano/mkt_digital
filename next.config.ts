import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Turbopack/webpack from bundling native/binary packages.
  // ffmpeg, AWS SDKs and fluent-ffmpeg must run in Node.js directly.
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/win32-x64",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@aws-sdk/client-polly",
    "@aws-sdk/client-bedrock-runtime",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
      { protocol: "https", hostname: "tjzk.replicate.delivery" },
    ],
  },
};

export default nextConfig;
