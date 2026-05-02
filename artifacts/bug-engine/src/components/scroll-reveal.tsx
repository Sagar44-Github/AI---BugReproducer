import { motion } from "framer-motion";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
  distance?: number;
}

export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  distance = 40,
}: ScrollRevealProps) {
  const initial =
    direction === "up" ? { opacity: 0, y: distance }
    : direction === "left" ? { opacity: 0, x: -distance }
    : direction === "right" ? { opacity: 0, x: distance }
    : { opacity: 0 };

  const animate = direction === "up" ? { opacity: 1, y: 0 }
    : direction === "left" ? { opacity: 1, x: 0 }
    : direction === "right" ? { opacity: 1, x: 0 }
    : { opacity: 1 };

  return (
    <motion.div
      className={className}
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className = "",
  staggerDelay = 0.08,
  containerDelay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
  containerDelay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-60px" }}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDelay,
            delayChildren: containerDelay,
          },
        },
        hidden: {},
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
  direction = "up",
  distance = 30,
}: {
  children: React.ReactNode;
  className?: string;
  direction?: "up" | "left" | "right" | "none";
  distance?: number;
}) {
  const hidden =
    direction === "up" ? { opacity: 0, y: distance }
    : direction === "left" ? { opacity: 0, x: -distance }
    : direction === "right" ? { opacity: 0, x: distance }
    : { opacity: 0 };

  const visible =
    direction === "up" ? { opacity: 1, y: 0 }
    : direction === "left" ? { opacity: 1, x: 0 }
    : direction === "right" ? { opacity: 1, x: 0 }
    : { opacity: 1 };

  return (
    <motion.div
      className={className}
      variants={{
        hidden,
        visible: { ...visible, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
