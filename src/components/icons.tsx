import type { SVGProps } from 'react';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M20 6 9 17l-5-5" /></svg>);
export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="m6 9 6 6 6-6" /></svg>);
export const MailIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>);
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 16V4m0 0-4 4m4-4 4 4" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>);
export const FileIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>);
export const AlertIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p}><path d="M12 9v4m0 4h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>);
export const SpinnerIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base} {...p} className={`animate-spin ${p.className ?? ''}`}><path d="M21 12a9 9 0 1 1-6.2-8.55" /></svg>);
