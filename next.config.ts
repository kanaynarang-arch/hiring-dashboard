import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pdf-parse loads a PDF.js worker file at runtime; bundling it breaks that lookup.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
