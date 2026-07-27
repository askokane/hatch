import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const base =
  "mono inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed border";

const variants: Record<Variant, string> = {
  primary: "bg-pine text-paper border-pine hover:bg-[#255c41]",
  secondary: "bg-paper text-ink border-hairline hover:border-ink",
  ghost: "bg-transparent text-ink border-transparent hover:bg-black/[0.04]",
  danger: "bg-paper text-brick border-brick hover:bg-brick-soft",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", className = "", ...props },
  ref
) {
  return <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props} />;
});
