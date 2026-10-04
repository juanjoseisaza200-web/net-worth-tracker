import React, { useLayoutEffect, useRef } from 'react';
import { groupThousands, ungroupTyped, caretInGrouped } from '../utils/number';

interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  /** Raw amount string ("1234567.5"), no separators. */
  value: string;
  onValueChange: (value: string) => void;
  /** Allow a decimal point (default true). Set false for whole numbers. */
  allowDecimal?: boolean;
}

/**
 * Amount input used by every money form. Shows thousands separators as you
 * type ("1,250,000") but hands the caller the raw string ("1250000"); accepts
 * a comma or dot as the decimal separator, rejects letters and minus signs,
 * and keeps the caret on the same digit when separators appear or vanish.
 * Callers still parse with `parseAmount()` at submit time to reject empty /
 * lone-"." values that would otherwise become `NaN`.
 */
export default function NumericInput({
  value,
  onValueChange,
  allowDecimal = true,
  inputMode,
  ...rest
}: NumericInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = groupThousands(value);
  const pattern = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;

  useLayoutEffect(() => {
    const input = ref.current;
    if (pendingCaret.current === null || !input || document.activeElement !== input) return;
    const at = caretInGrouped(display, pendingCaret.current);
    input.setSelectionRange(at, at);
    pendingCaret.current = null;
  }, [display]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const typed = e.target.value;
    const isDeletion = (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false;
    const raw = ungroupTyped(typed, isDeletion);
    if (raw !== '' && !pattern.test(raw)) return;

    // Characters (digits and the decimal point) before the caret, so it can
    // be put back after the same one once the value is regrouped.
    const caret = e.target.selectionStart ?? typed.length;
    let kept = typed.slice(0, caret).replace(/,/g, '').length;
    const commaBecameDecimal = raw.includes('.') && !typed.includes('.');
    if (commaBecameDecimal && typed.lastIndexOf(',') < caret) kept += 1;
    pendingCaret.current = kept;

    onValueChange(raw);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={inputMode ?? (allowDecimal ? 'decimal' : 'numeric')}
      value={display}
      onChange={handleChange}
    />
  );
}
