import { useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
  glare?: boolean;
}

export function TiltCard({ children, className = "", intensity = 12, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const xSpring = useSpring(x, { stiffness: 300, damping: 30 });
  const ySpring = useSpring(y, { stiffness: 300, damping: 30 });

  const rotateX = useTransform(ySpring, [-0.5, 0.5], [intensity, -intensity]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [-intensity, intensity]);

  const glareX = useTransform(xSpring, [-0.5, 0.5], ["0%", "100%"]);
  const glareY = useTransform(ySpring, [-0.5, 0.5], ["0%", "100%"]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    x.set(px);
    y.set(py);
  }, [x, y]);

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`relative ${className}`}
    >
      <div style={{ transform: "translateZ(0px)" }}>
        {children}
      </div>
      {glare && (
        <motion.div
          className="absolute inset-0 rounded-[inherit] pointer-events-none overflow-hidden"
          style={{
            background: "radial-gradient(circle at var(--glare-x) var(--glare-y), rgba(255,255,255,0.07) 0%, transparent 60%)",
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(circle at 50% 50%, rgba(6,182,212,0.06) 0%, transparent 70%)",
              x: useTransform(glareX, v => `calc(${v} - 50%)`),
              y: useTransform(glareY, v => `calc(${v} - 50%)`),
            }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
