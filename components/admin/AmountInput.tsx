"use client";

import { Input } from "@/components/ui/input";

// Controlled whole-number input that displays space-grouped digits
// (fr-FR style, e.g. "1 500 000") while reporting a plain integer — or null
// when cleared — to the parent. Digits only; no decimals.
export function AmountInput({
  value,
  onChange,
  id,
  name,
  placeholder,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
}) {
  const display = value == null ? "" : value.toLocaleString("fr-FR");

  return (
    <Input
      id={id}
      name={name}
      inputMode="numeric"
      placeholder={placeholder}
      className={className}
      value={display}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits === "" ? null : parseInt(digits, 10));
      }}
    />
  );
}
