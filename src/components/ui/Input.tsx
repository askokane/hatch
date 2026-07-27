import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, hint, className = "", id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="label-mono">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-2xs text-ink-muted">
          {hint}
        </p>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`border ${error ? "border-brick" : "border-hairline"} bg-white px-3 py-2 text-base focus:border-ink ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-2xs text-brick" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
