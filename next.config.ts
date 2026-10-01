import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
  // The dashboard has a send button, so it must not be embeddable in another site (clickjacking).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
