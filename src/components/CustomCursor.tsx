'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseR: number;       // Base radius from screen center
  baseAngle: number;   // Base angle around screen center
  rotSpeed: number;    // Rotation speed around center
  baseSize: number;    // Original size
  size: number;        // Current animated size
  color: string;
  phase: number;       // Unique wave phase
  amplitude: number;   // Radial wave amplitude
  baseAlpha: number;   // Base transparency
  alpha: number;       // Current animated transparency
  twinkleSpeed: number;// Speed of twinkling
}

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  // Universe/Starry palette: Shades of deep & bright blue, and pure white
  const colors = [
    '#ffffff', // Pure White
    '#e0f2fe', // Ice White/Blue
    '#bae6fd', // Pale Sky Blue
    '#60a5fa', // Bright Sky Blue
    '#3b82f6', // Deep Royal Blue
    '#2563eb', // Indigo Blue
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const particleCount = 380;       // Dense field of particles
    const repelRadius = 150;         // 150px interaction hole
    const pushStrength = 130;        // Repulsion distance
    const springK = 0.04;            // Spring stiffness for returning home
    const damping = 0.88;            // Viscous damping factor

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let time = 0;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      cx = width / 2;
      cy = height / 2;
    };

    const initParticles = () => {
      particles = [];
      const maxDist = Math.max(window.innerWidth, window.innerHeight);

      for (let i = 0; i < particleCount; i++) {
        // Distribute particles exponentially so they are denser near the center
        const t = i / particleCount;
        const r = 40 + Math.pow(t, 1.5) * (maxDist * 0.9);
        const angle = Math.random() * Math.PI * 2;
        
        // Closer particles rotate slightly faster to create a realistic shear/vortex
        const direction = Math.random() > 0.15 ? 1 : -1; // mostly rotate clockwise
        const rotSpeed = direction * (0.001 + (1 - t) * 0.003);

        const initialX = cx + Math.cos(angle) * r;
        const initialY = cy + Math.sin(angle) * r;

        const baseSize = Math.random() * 1.2 + 0.6; // 0.6px to 1.8px
        const baseAlpha = Math.random() * 0.4 + 0.35; // 0.35 to 0.75 base opacity

        particles.push({
          x: initialX,
          y: initialY,
          vx: 0,
          vy: 0,
          baseR: r,
          baseAngle: angle,
          rotSpeed,
          baseSize,
          size: baseSize,
          color: colors[Math.floor(Math.random() * colors.length)],
          phase: Math.random() * Math.PI * 2,
          amplitude: Math.random() * 20 + 8, // Radial wave motion
          baseAlpha,
          alpha: baseAlpha,
          twinkleSpeed: Math.random() * 0.03 + 0.015,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    // Initialize
    resizeCanvas();
    initParticles();

    window.addEventListener('resize', () => {
      resizeCanvas();
    });
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Animation Loop
    const render = () => {
      time += 0.8;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const mouseActive = mouseRef.current.active;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 1. Advance the default vortex/swirling animation
        p.baseAngle += p.rotSpeed;
        
        // Add a gentle organic waving oscillation to the radius
        const currentR = p.baseR + Math.sin(time * 0.02 + p.phase) * p.amplitude;
        
        // Calculate original/natural target flow positions
        let targetX = cx + Math.cos(p.baseAngle) * currentR;
        let targetY = cy + Math.sin(p.baseAngle) * currentR;

        // 2. Apply magnetic repulsion from cursor
        if (mouseActive) {
          const dx = mx - targetX;
          const dy = my - targetY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < repelRadius) {
            const force = (repelRadius - dist) / repelRadius; // 1 at mouse, 0 at border
            // Push target coordinates away from the cursor
            targetX -= (dx / (dist || 1)) * force * pushStrength;
            targetY -= (dy / (dist || 1)) * force * pushStrength;
          }
        }

        // 3. Spring Physics Math (Spring-Mass-Damper model)
        // Acceleration = (target - current) * stiffness
        const ax = (targetX - p.x) * springK;
        const ay = (targetY - p.y) * springK;

        // Velocity = (velocity + acceleration) * damping
        p.vx = (p.vx + ax) * damping;
        p.vy = (p.vy + ay) * damping;

        // Position update
        p.x += p.vx;
        p.y += p.vy;

        // 4. Twinkling / Star Shine effect (pulsate size and alpha over time)
        const twinkle = Math.sin(time * p.twinkleSpeed + p.phase);
        p.alpha = Math.max(0.1, Math.min(1.0, p.baseAlpha + twinkle * 0.3));
        p.size = Math.max(0.4, p.baseSize + twinkle * (p.baseSize * 0.35));

        // 5. Render Particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 99999, // On top of backgrounds, behind interactions
      }}
    />
  );
}
