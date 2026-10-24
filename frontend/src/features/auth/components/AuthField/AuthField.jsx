import { forwardRef, useId, useState } from "react";

export const fieldClass = (hasError) =>
  `block min-h-12 w-full rounded-xl border bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 sm:text-sm ${
    hasError ? "border-red-400 focus:border-red-500 focus:ring-red-100" : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-100"
  }`;

// Works with react-hook-form's {...register("name")}. Use as="select" for a dropdown.
const AuthField = forwardRef(function AuthField(
  { label, error, hint, as: Tag = "input", type = "text", children, className = "", ...props },
  ref
) {
  const id = useId();
  const note = `${id}-note`;
  const [show, setShow] = useState(false);
  const password = Tag === "input" && type === "password";

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-bold text-slate-700">{label}</label>
      <div className="relative">
        <Tag
          ref={ref}
          id={id}
          {...(Tag === "input" ? { type: password && show ? "text" : type } : {})}
          aria-invalid={!!error}
          aria-describedby={error || hint ? note : undefined}
          className={`${fieldClass(!!error)} ${password ? "pr-20" : ""}`}
          {...props}
        >
          {children}
        </Tag>
        {password && (
          <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error ? <p id={note} role="alert" className="mt-1 text-xs font-semibold text-red-600">{error}</p>
        : hint ? <p id={note} className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
});

export default AuthField;
