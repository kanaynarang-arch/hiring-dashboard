'use client';

import { useEffect } from 'react';

// A link like /dashboard?role=pm#c-<id> opens that candidate's row and scrolls to it.
export default function HashOpener() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el instanceof HTMLDetailsElement) el.open = true;
    el?.scrollIntoView({ block: 'center' });
  }, []);
  return null;
}
