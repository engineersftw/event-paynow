import type { InlineKeyboard } from 'grammy';
import type { FormFields } from '../payments/form-fields.js';

// The parsing and checks live in src/payments/ because the Pages Function bundles them too.
export * from '../payments/form-fields.js';

const tick = (on: boolean) => (on ? '✅' : '⬜');

/** The two switches both `/init` and `/edit_event` show; `prefix` is the callback namespace. */
export function toggleRow(kb: InlineKeyboard, f: FormFields, prefix: string): InlineKeyboard {
  return kb
    .text(`${tick(f.name)} Full name`, `${prefix}:name`)
    .text(`${tick(f.email)} Email`, `${prefix}:email`);
}
