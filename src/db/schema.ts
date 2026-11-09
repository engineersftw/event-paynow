import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Data model per design §5.
 * Drizzle schema; `drizzle-kit generate` produces SQL migrations from this.
 */

export const users = sqliteTable('users', {
  telegramId: integer('telegram_id').primaryKey(),
  payeeType: text('payee_type').notNull(), // 'mobile' | 'uen'
  payeeValue: text('payee_value').notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ref: text('ref').notNull().unique(),
  chatId: integer('chat_id').notNull(),
  topicId: integer('topic_id').notNull().default(0),
  name: text('name').notNull(),
  payeeType: text('payee_type').notNull(), // 'mobile' | 'uen'
  payeeValue: text('payee_value').notNull(),
  status: text('status').notNull().default('open'), // 'open' | 'closed'
  createdAt: text('created_at').notNull(),
  closedAt: text('closed_at'),
  // Amount suggested for each payment request, in cents (null = none); set in /init
  defaultAmountCents: integer('default_amount_cents'),
  websiteUrl: text('website_url'), // optional link to the event's own page (http/https only)
});

export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ref: text('ref').notNull().unique(),
  userId: integer('user_id').notNull(),
  eventId: integer('event_id').notNull(),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  payeeType: text('payee_type').notNull(),
  payeeValue: text('payee_value').notNull(),
  status: text('status').notNull(), // 'pending' | 'received' | 'voided'
  source: text('source').notNull(), // 'manual' | 'notification' (future)
  qrPayload: text('qr_payload').notNull(),
  payerType: text('payer_type'), // 'mobile' | 'uen' | null (legacy rows)
  payerValue: text('payer_value'),
  payerName: text('payer_name'),
  createdAt: text('created_at').notNull(),
  receivedAt: text('received_at'),
  // Audit: Telegram user ids of whoever performed the action (null for older rows)
  receivedBy: integer('received_by'),
  voidedBy: integer('voided_by'),
  // Door check-in (once per payment): when, and the Telegram user id of the admin
  checkedInAt: text('checked_in_at'),
  checkedInBy: integer('checked_in_by'),
});

export const paybacks = sqliteTable('paybacks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ref: text('ref').notNull().unique(),
  paymentId: integer('payment_id').notNull(),
  payerType: text('payer_type').notNull(),
  payerValue: text('payer_value').notNull(),
  amountCents: integer('amount_cents').notNull(),
  status: text('status').notNull(), // 'pending' | 'sent' | 'cancelled'
  qrPayload: text('qr_payload').notNull(),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
  // Audit: Telegram user ids of whoever performed the action (null for older rows)
  createdBy: integer('created_by'),
  sentBy: integer('sent_by'),
  cancelledBy: integer('cancelled_by'),
});

/**
 * Anonymous usage counts (Simple_PayNow_Bot): one row per Singapore calendar day and metric.
 * Holds only a day, a metric name and a number: never a payee, amount, description or identity.
 */
export const usageCounters = sqliteTable(
  'usage_counters',
  {
    day: text('day').notNull(), // YYYY-MM-DD, Singapore time
    metric: text('metric').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })]
);
