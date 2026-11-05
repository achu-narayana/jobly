import { motion } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "ghost" | "outline" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-fg text-bg font-semibold hover:bg-accent-2",
  ghost: "text-fg-2 hover:text-fg hover:bg-bg-3",
  outline: "border border-line-2 text-fg hover:border-accent/60 hover:bg-bg-3",
  danger: "text-rose hover:bg-rose/10",
};

export function Button({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2.5" };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
        VARIANTS[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = "neutral",
  onRemove,
  active,
  onClick,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "violet" | "amber" | "rose" | "sky";
  onRemove?: () => void;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const tones = {
    neutral: "border-line-2 text-fg-2",
    accent: "border-accent/40 text-accent bg-accent/8",
    violet: "border-violet/40 text-violet bg-violet/8",
    amber: "border-amber/40 text-amber bg-amber/8",
    rose: "border-rose/40 text-rose bg-rose/8",
    sky: "border-sky/40 text-sky bg-sky/8",
  };
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      title={title}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 h-7 text-xs font-medium whitespace-nowrap transition-colors",
        tones[tone],
        onClick && "hover:bg-bg-3 cursor-pointer",
        active && "ring-1 ring-accent",
      )}
    >
      {children}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 -mr-1 rounded-full px-1 text-fg-3 hover:text-rose" aria-label="remove">
          ×
        </button>
      )}
    </Tag>
  );
}

/** Animated circular score ring. */
export function Ring({ value, size = 56, stroke = 5, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 70 ? "#ffffff" : value >= 45 ? "#9a9a9a" : "#555555";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line-2)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * value) / 100 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: value >= 70 ? `drop-shadow(0 0 5px rgba(255,255,255,0.6))` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-mono text-sm font-medium">{value}</span>
        {label && <span className="text-[9px] uppercase tracking-wider text-fg-3">{label}</span>}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-2 bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-2">{children}</kbd>;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="h-12 w-12 rounded-full border border-dashed border-line-2 animate-pulse-soft" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-fg-2">{body}</p>
      {action}
    </div>
  );
}
