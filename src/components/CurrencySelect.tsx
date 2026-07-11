import { Currency } from '../types';
import { SUPPORTED_CURRENCIES } from '../utils/currency';

interface CurrencySelectProps {
  value: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/**
 * Currency `<select>` backed by the single SUPPORTED_CURRENCIES list, replacing
 * the ~13 hand-rolled copies that each redeclared the currency options. Pass
 * `className` to keep each call site's existing styling.
 */
export default function CurrencySelect({ value, onChange, className, ...rest }: CurrencySelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Currency)}
      className={className}
      {...rest}
    >
      {SUPPORTED_CURRENCIES.map(currency => (
        <option key={currency} value={currency}>{currency}</option>
      ))}
    </select>
  );
}
