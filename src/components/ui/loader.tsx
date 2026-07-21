"use client";

import type { Transition, Variants } from "motion/react";
import { motion } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export interface LoaderIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface LoaderIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const G_VARIANTS: Variants = {
  normal: { rotate: 360 },
  animate: {
    rotate: 360,
  },
};

const DEFAULT_TRANSITION: Transition = {
  type: "spring",
  stiffness: 50,
  damping: 10,
};

const LoaderIcon = forwardRef<LoaderIconHandle, LoaderIconProps>(
  ({ className, size = 28, ...props }, ref) => {
    return (
      <div className={cn(className)} {...props}>
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.g
            animate={{
              rotate: 180,
              transition: {
                duration: 0.8,
                ease: "linear",
              },
            }}
            style={{ transformOrigin: "12px 12px" }}
            transition={{ ...DEFAULT_TRANSITION, repeat: Infinity, repeatType: "loop" }}
            variants={G_VARIANTS}
          >
            <path d="M12 2v4" />
            <path d="m16.2 7.8 2.9-2.9" />
            <path d="M18 12h4" />
            <path d="m16.2 16.2 2.9 2.9" />
            <path d="M12 18v4" />
            <path d="m4.9 19.1 2.9-2.9" />
            <path d="M2 12h4" />
            <path d="m4.9 4.9 2.9 2.9" />
          </motion.g>
        </svg>
      </div>
    );
  },
);

LoaderIcon.displayName = "LoaderIcon";

export { LoaderIcon };
