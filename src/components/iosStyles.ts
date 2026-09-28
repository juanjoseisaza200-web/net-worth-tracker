/**
 * Shared class strings for the iOS look, for elements that stay plain HTML
 * (form fields, buttons). Components live in ios.tsx.
 */
export const ios = {
  /** Text/number/date input: filled field, no border, like an iOS search field. */
  input: 'w-full px-3.5 py-2.5 rounded-xl bg-ios-fill text-ios-body text-ios-label placeholder:text-ios-tertiary border-0 focus:outline-none focus:ring-2 focus:ring-ios-blue',
  /** Native <select> in the same filled style (keeps the platform arrow). */
  select: 'w-full px-3 py-2.5 rounded-xl bg-ios-fill text-ios-body text-ios-label border-0 focus:outline-none focus:ring-2 focus:ring-ios-blue',
  /** Field caption above an input. */
  label: 'block text-ios-footnote text-ios-secondary mb-1 px-1',
  /** Helper text under a field or section. */
  hint: 'mt-1 px-1 text-ios-footnote text-ios-secondary',
  /** Grouped card surface. */
  card: 'bg-ios-card rounded-ios',
  buttonPrimary: 'h-11 px-5 rounded-full bg-ios-blue text-white text-ios-headline flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-40',
  buttonSecondary: 'h-11 px-5 rounded-full bg-ios-fill text-ios-blue text-ios-headline flex items-center justify-center gap-2 active:opacity-60 disabled:opacity-40',
  buttonDestructive: 'h-11 px-5 rounded-full bg-ios-fill text-ios-red text-ios-headline flex items-center justify-center gap-2 active:opacity-60 disabled:opacity-40',
  /** Round icon-only button (edit layout, add, etc.). */
  iconButton: 'w-9 h-9 rounded-full bg-ios-fill text-ios-blue flex items-center justify-center shrink-0 active:opacity-60',
  /** Compact pill <select>, e.g. the view-currency picker next to a title. */
  pillSelect: 'h-9 px-3 rounded-full bg-ios-fill text-ios-blue text-ios-subhead font-semibold appearance-none text-center focus:outline-none',
  /** Small inline icon action inside a row (edit/delete). */
  rowAction: 'p-2 -m-1 rounded-full text-ios-blue active:bg-ios-fill',
  rowActionDestructive: 'p-2 -m-1 rounded-full text-ios-red active:bg-ios-fill',
};
