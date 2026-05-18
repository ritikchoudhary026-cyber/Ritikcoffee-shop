'use client';

import { useEffect, useRef, useState } from 'react';

export default function CustomCursor() {
  const lensRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  const SIZE = 56; // diameter in px
  const HALF = SIZE / 2;

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const tx = `translate(${e.clientX}px,${e.clientY}px)`;
      if (lensRef.current) lensRef.current.style.transform = tx;
      if (dotRef.current) dotRef.current.style.transform = tx;
      setVisible(true);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', () => setVisible(false));
    document.addEventListener('mouseenter', () => setVisible(true));
    document.documentElement.style.cursor = 'none';

    return () => {
      document.removeEventListener('mousemove', move);
      document.documentElement.style.cursor = '';
    };
  }, []);

  const base: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    willChange: 'transform',
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.2s ease',
  };

  return (
    <>
      {/*
        THE PURPLE X-RAY LENS
        ──────────────────────────────────────────────────────────────
        mix-blend-mode: difference   →  |source - destination|
          • On black bg  (#050505):  purple shows up as purple  ✓
          • On white text (#ffffff): text flips to dark/inverted ✓
          • On any colour:           creates X-ray colour shift  ✓

        clipPath: circle()  →  hard clip at exactly the circle edge,
                               zero feathering / blur outside.

        No border div — the circle fill IS the effect.
        ──────────────────────────────────────────────────────────────
      */}
      <div
        ref={lensRef}
        style={{
          ...base,
          zIndex: 99998,
          width: `${SIZE}px`,
          height: `${SIZE}px`,
          marginLeft: `-${HALF}px`,
          marginTop: `-${HALF}px`,
          borderRadius: '50%',
          /* 
            Solid purple/pink fill — bright enough to invert dark content,
            purple enough to look like the reference photo.
            Center slightly lighter → subtle depth, not flat.
          */
          background:
            'radial-gradient(circle, rgba(230,180,255,1) 0%, rgba(200,120,255,1) 50%, rgba(170,80,255,0.95) 100%)',
          clipPath: 'circle(50% at 50% 50%)',
          mixBlendMode: 'difference',
          /* slight outer glow so lens pops on dark sections */
          filter: 'drop-shadow(0 0 6px rgba(190,100,255,0.6))',
        }}
      />

      {/* Tiny white dot in the very centre */}
      <div
        ref={dotRef}
        style={{
          ...base,
          zIndex: 99999,
          width: '5px',
          height: '5px',
          marginLeft: '-2.5px',
          marginTop: '-2.5px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          mixBlendMode: 'difference',
        }}
      />
    </>
  );
}
