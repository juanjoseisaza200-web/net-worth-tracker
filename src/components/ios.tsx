import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LucideIcon } from 'lucide-react';

/**
 * Small building blocks for the iOS look (inset grouped lists, as in
 * Settings). Colors come from the `ios-*` Tailwind tokens, which resolve to
 * CSS variables that follow the system light/dark setting.
 */

export function Section({ title, action, footer, children }: {
  title?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      {(title || action) && (
        <div className="flex items-end justify-between px-4 pb-1.5 min-h-[18px]">
          {title && <h2 className="text-ios-footnote uppercase text-ios-secondary">{title}</h2>}
          {action}
        </div>
      )}
      <div className="bg-ios-card rounded-ios overflow-hidden">{children}</div>
      {footer && <p className="px-4 pt-1.5 text-ios-footnote text-ios-secondary">{footer}</p>}
    </section>
  );
}

/** White rounded square with a glyph, like the icons in iOS Settings. */
export function IconSquare({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
      <Icon size={18} color="white" strokeWidth={2.25} />
    </div>
  );
}

export function Row({ icon, title, subtitle, value, detail, to, onClick, accessory }: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  /** Makes the row a navigation link with a chevron. */
  to?: string;
  /** Makes the row a button (e.g. open it for editing). */
  onClick?: () => void;
  /** Trailing control(s), e.g. a Switch or small icon buttons. */
  accessory?: ReactNode;
}) {
  const content = (
    <>
      <div className="flex-1 min-w-0">
        <div className="text-ios-body truncate">{title}</div>
        {subtitle && <div className="text-ios-subhead text-ios-secondary truncate">{subtitle}</div>}
      </div>
      {(value !== undefined || detail) && (
        <div className="text-right shrink-0 max-w-[60%]">
          {value !== undefined && <div className="text-ios-body tabular-nums truncate">{value}</div>}
          {detail && <div className="text-ios-footnote text-ios-secondary">{detail}</div>}
        </div>
      )}
      {(to || onClick) && !accessory && <ChevronRight size={18} className="text-ios-tertiary shrink-0 -mr-1" strokeWidth={2.5} />}
    </>
  );
  // The tappable part and the accessory are siblings so a trailing button
  // (e.g. delete) is never nested inside the row's own button/link.
  const areaClass = 'flex-1 min-w-0 flex items-center gap-3 py-2.5 text-left';
  const area = to
    ? <Link to={to} className={`${areaClass} active:opacity-60`}>{content}</Link>
    : onClick
      ? <button type="button" onClick={onClick} className={`${areaClass} active:opacity-60`}>{content}</button>
      : <div className={areaClass}>{content}</div>;
  return (
    <div className="ios-row flex items-center gap-3 pl-4 min-h-[44px]">
      {icon && <div className="py-2.5 shrink-0">{icon}</div>}
      <div className="ios-row-content flex-1 min-w-0 flex items-center gap-3 pr-4">
        {area}
        {accessory}
      </div>
    </div>
  );
}

/** Large title (34pt bold) with optional trailing actions, as in a UINavigationBar. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-1 mb-4">
      <h1 className="text-ios-large truncate">{title}</h1>
      {children && <div className="flex items-center gap-2 mb-1 shrink-0">{children}</div>}
    </div>
  );
}

/** UISegmentedControl look-alike. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex p-[2px] rounded-[9px] bg-ios-fill" role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 min-h-[30px] px-2 rounded-[7px] text-ios-footnote font-semibold text-ios-label transition-colors ${value === o.value ? 'bg-ios-segment shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)]' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** UISwitch look-alike. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200"
      style={{ backgroundColor: checked ? 'var(--ios-green)' : 'var(--ios-fill)' }}
    >
      <span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}
