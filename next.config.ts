import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pdf-parse (PDF.js) loads a worker file and a canvas polyfill at runtime through
  // dynamic requires that file tracing cannot see, so keep them external AND include
  // them in the function that parses uploads.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/upload': [
      './node_modules/pdf-parse/**/*',
      './node_modules/pdfjs-dist/legacy/build/**/*',
      './node_modules/@napi-rs/canvas/**/*',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
    ],
  },
};

export default nextConfig;
