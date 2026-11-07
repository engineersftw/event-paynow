import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Data model per design §5.
 * Drizzle schema; `drizzle-kit generate` produces SQL migrations from this.
 */

export const users = sqliteTable("users", {
  telegramId: integer("telegram_id").primaryKey(),
  payeeType: text("payee_type").notNull(), // 'mobile' | 'uen'
  payeeValue: text("payee_value").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const payments = sqliteTable("payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ref: text("ref").notNull().unique(),
  userId: integer("user_id").notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  payeeType: text("payee_type").notNull(),
  payeeValue: text("payee_value").notNull(),
  status: text("status").notNull(), // 'pending' | 'received'
  source: text("source").notNull(), // 'manual' | 'notification' (future)
  qrPayload: text("qr_payload").notNull(),
  createdAt: text("created_at").notNull(),
  receivedAt: text("received_at"),
});

export const paybacks = sqliteTable("paybacks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ref: text("ref").notNull().unique(),
  paymentId: integer("payment_id").notNull(),
  payerType: text("payer_type").notNull(),
  payerValue: text("payer_value").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(), // 'pending' | 'sent'
  qrPayload: text("qr_payload").notNull(),
  createdAt: text("created_at").notNull(),
  sentAt: text("sent_at"),
});
