/**
 * The details an event's payment page asks each payer for: Full name and Email (each on or off)
 * and up to three organiser-named text fields. Stored as JSON in `events.form_fields`; anything
 * malformed reads as "nothing asked", so a bad value can never break the payment page.
 */
export interface FormFields {
  name: boolean;
  email: boolean;
  custom: string[];
}

export const MAX_CUSTOM_FIELDS = 3;
export const MAX_LABEL = 30;
export const MAX_FULL_NAME = 80;
export const MAX_EMAIL = 120;
export const MAX_ANSWER = 100;

export const NO_FIELDS: FormFields = { name: false, email: false, custom: [] };

export function parseFormFields(raw: string | null | undefined): FormFields {
  if (!raw) return NO_FIELDS;
  try {
    const v = JSON.parse(raw) as Partial<FormFields> | null;
    const custom = Array.isArray(v?.custom)
      ? v.custom.filter(
          (l): l is string => typeof l === 'string' && l.length > 0 && l.length <= MAX_LABEL
        )
      : [];
    return {
      name: v?.name === true,
      email: v?.email === true,
      custom: custom.slice(0, MAX_CUSTOM_FIELDS),
    };
  } catch {
    return NO_FIELDS;
  }
}

/** The stored form: null when nothing is asked. */
export function serializeFormFields(f: FormFields): string | null {
  return f.name || f.email || f.custom.length > 0 ? JSON.stringify(f) : null;
}

/** A custom label as typed, or why it is refused. */
export function checkLabel(
  input: string,
  existing: FormFields
): { ok: true; label: string } | { ok: false; reason: string } {
  const label = input.trim().replace(/\s+/g, ' ');
  if (label.length === 0 || label.length > MAX_LABEL) {
    return { ok: false, reason: `A field name must be 1 to ${MAX_LABEL} characters.` };
  }
  if (existing.custom.length >= MAX_CUSTOM_FIELDS) {
    return { ok: false, reason: `An event can have at most ${MAX_CUSTOM_FIELDS} custom fields.` };
  }
  const taken = [
    ...existing.custom,
    ...(existing.name ? ['full name'] : []),
    ...(existing.email ? ['email'] : []),
  ];
  if (taken.some((t) => t.toLowerCase() === label.toLowerCase())) {
    return { ok: false, reason: 'That field is already there.' };
  }
  return { ok: true, label };
}

/** Simple `local@domain.tld`: no spaces, one `@`, a dot in the domain. Not a deliverability check. */
export function isEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

/** One line for confirmations and replies. */
export function describeFormFields(f: FormFields): string {
  const asked = [...(f.name ? ['Full name'] : []), ...(f.email ? ['Email'] : []), ...f.custom];
  return asked.length > 0 ? asked.join(', ') : 'nothing extra';
}
