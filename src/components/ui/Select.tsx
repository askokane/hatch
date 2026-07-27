import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
};

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, error, options, className = "", id, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="label-mono">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={`border ${error ? "border-brick" : "border-hairline"} bg-white px-3 py-2 text-base focus:border-ink ${className}`}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-2xs text-brick" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});
