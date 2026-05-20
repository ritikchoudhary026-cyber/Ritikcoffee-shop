'use client';

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  angleSpeed: number;
  amplitude: number;
  alpha: number;
  isTrail: boolean;
  life?: number;
  maxLife?: number;
}

export default function CustomCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  // Curated color palette inspired by Google Antigravity / modern aesthetics
  const colors = [
    '#3B82F6', // Vibrant Blue
    '#EF4444', // Vibrant Red
    '#10B981', // Emerald Green
    '#F59E0B', // Amber Gold
    '#EC4899', // Pink
    '#8B5CF6', // Purple
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    const maxPermanentParticles = 180;
    const interactionRadius = 160;

    // Handle high DPI screens (Retina)
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      // Re-initialize permanent particles when window sizes change
      initPermanentParticles(width, height);
    };

    const initPermanentParticles = (width: number, height: number) => {
      // Keep existing trail particles, recreate permanent ones
      particles = particles.filter(p => p.isTrail);

      for (let i = 0; i < maxPermanentParticles; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: 0,
          vy: 0,
          size: Math.random() * 1.5 + 0.8, // Tiny crisp dots/dashes
          color: colors[Math.floor(Math.random() * colors.length)],
          angle: Math.random() * Math.PI * 2,
          angleSpeed: Math.random() * 0.02 - 0.01,
          amplitude: Math.random() * 15 + 5,
          alpha: Math.random() * 0.4 + 0.3, // Soft background glow
          isTrail: false,
        });
      }
    };

    // Tracks mouse position
    const handleMouseMove = (e: MouseEvent) => {
      const px = e.clientX;
      const py = e.clientY;
      mouseRef.current.x = px;
      mouseRef.current.y = py;
      mouseRef.current.active = true;

      // Spawn trail particles at mouse coordinates
      // Only spawn if mouse is active and within bounds
      if (Math.random() < 0.6) {
        particles.push({
          x: px,
          y: py,
          baseX: px,
          baseY: py,
          vx: (Math.random() - 0.5) * 1.8,
          vy: (Math.random() - 0.5) * 1.8 - 0.5, // Float slightly upwards
          size: Math.random() * 2 + 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          angle: Math.random() * Math.PI * 2,
          angleSpeed: Math.random() * 0.1 - 0.05,
          amplitude: Math.random() * 10,
          alpha: 1,
          isTrail: true,
          life: 60,
          maxLife: 60,
        });
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    // Initial resize
    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Animation Loop
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const mouseActive = mouseRef.current.active;

      // Filter and update particles
      particles = particles.filter(p => {
        if (p.isTrail) {
          p.life = (p.life || 0) - 1;
          if (p.life <= 0) return false;
          
          p.x += p.vx + Math.sin(p.angle) * 0.3;
          p.y += p.vy;
          p.angle += p.angleSpeed;
          p.alpha = p.life / (p.maxLife || 60);
        } else {
          // Permanent particles float/wave in sine pattern around their base positions
          p.angle += p.angleSpeed;
          let targetX = p.baseX + Math.sin(p.angle) * p.amplitude;
          let targetY = p.baseY + Math.cos(p.angle) * p.amplitude;

          // Mouse interaction (repel/wave effect)
          if (mouseActive) {
            const dx = mx - targetX;
            const dy = my - targetY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < interactionRadius) {
              const force = (interactionRadius - dist) / interactionRadius;
              // Push particles away from the cursor
              targetX -= (dx / dist) * force * 45;
              targetY -= (dy / dist) * force * 45;
              
              // Add a slight swirl around the cursor
              const angleOffset = Math.atan2(dy, dx) + Math.PI / 2;
              targetX += Math.cos(angleOffset) * force * 15;
              targetY += Math.sin(angleOffset) * force * 15;
            }
          }

          // Smooth easing towards target
          p.x += (targetX - p.x) * 0.08;
          p.y += (targetY - p.y) * 0.08;
        }

        // Draw particle (draw small angled dashes or crisp dots)
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        
        ctx.beginPath();
        if (p.isTrail) {
          // Draw trail as glowing tiny circles
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Draw background particles as tiny elegant dashes (like the screenshot)
          const angle = p.angle;
          const length = p.size * 2.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(angle) * length, p.y + Math.sin(angle) * length);
          ctx.stroke();
        }
        ctx.restore();

        return true;
      });

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
        zIndex: 99999,
      }}
    />
  );
}
