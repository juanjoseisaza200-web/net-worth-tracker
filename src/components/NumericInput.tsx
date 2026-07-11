import React from 'react';

interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onValueChange: (value: string) => void;
  /** Allow a decimal point (default true). Set false for whole numbers like day-of-month. */
  allowDecimal?: boolean;
}

/**
 * Controlled text input that only accepts digits and (optionally) a single
 * decimal point. Centralizes the `.replace(',', '.')` + regex gate that was
 * copy-pasted across every money form, so amounts can't contain letters or a
 * minus sign. Emits the raw (already-validated) string; callers must still parse
 * it with `parseAmount()` at submit time to reject empty / lone-"." values that
 * would otherwise become `NaN`.
 */
export default function NumericInput({
  value,
  onValueChange,
  allowDecimal = true,
  inputMode,
  ...rest
}: NumericInputProps) {
  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(',', '.');
    if (raw === '' || pattern.test(raw)) {
      onValueChange(raw);
    }
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={inputMode ?? (allowDecimal ? 'decimal' : 'numeric')}
      value={value}
      onChange={handleChange}
    />
  );
}
