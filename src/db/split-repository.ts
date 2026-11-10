/**
 * What Split_PayNow_Bot keeps beyond a conversation: contacts (who has started the bot, so a
 * mention can be sent a direct message) and waiting QRs (a mentioned person it could not message
 * yet). Claims hold the QR payload, which contains the payee, so they are deleted when used and
 * expire after CLAIM_TTL_MS.
 */

export const CLAIM_TTL_MS = 48 * 60 * 60 * 1000;

export interface Claim {
  token: string;
  username: string | null; // lowercase, no @
  userId: number | null;
  name: string;
  amountCents: number;
  description: string | null;
  payload: string;
  organiser: string;
  chatId: number;
  messageId: number | null;
  expiresAt: string;
}

export interface SplitDirectory {
  /** Record who a username belongs to, replacing the user's and the username's earlier rows. */
  saveContact(username: string, userId: number): Promise<void>;
  /** Known user ids for lowercase usernames. */
  findContacts(usernames: string[]): Promise<Map<string, number>>;
  forget(userId: number): Promise<void>;
  createClaim(claim: Omit<Claim, 'messageId'>): Promise<void>;
  /** The claim, or null when missing or expired. */
  getClaim(token: string, now?: Date): Promise<Claim | null>;
  /** True when this call removed the claim (so exactly one caller wins a race). */
  deleteClaim(token: string): Promise<boolean>;
  claimsForMessage(chatId: number, messageId: number): Promise<Claim[]>;
  setClaimsMessage(tokens: string[], messageId: number): Promise<void>;
}

type Row = {
  token: string;
  username: string | null;
  user_id: number | null;
  name: string;
  amount_cents: number;
  description: string | null;
  payload: string;
  organiser: string;
  chat_id: number;
  message_id: number | null;
  expires_at: string;
};

const toClaim = (r: Row): Claim => ({
  token: r.token,
  username: r.username,
  userId: r.user_id,
  name: r.name,
  amountCents: r.amount_cents,
  description: r.description,
  payload: r.payload,
  organiser: r.organiser,
  chatId: r.chat_id,
  messageId: r.message_id,
  expiresAt: r.expires_at,
});

export class D1SplitDirectory implements SplitDirectory {
  constructor(private readonly d1: D1Database) {}

  async saveContact(username: string, userId: number): Promise<void> {
    await this.d1.batch([
      this.d1
        .prepare('DELETE FROM split_contacts WHERE user_id = ?1 OR username = ?2')
        .bind(userId, username),
      this.d1
        .prepare('INSERT INTO split_contacts (username, user_id, updated_at) VALUES (?1, ?2, ?3)')
        .bind(username, userId, new Date().toISOString()),
    ]);
  }

  async findContacts(usernames: string[]): Promise<Map<string, number>> {
    const found = new Map<string, number>();
    if (usernames.length === 0) return found;
    const marks = usernames.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await this.d1
      .prepare(`SELECT username, user_id FROM split_contacts WHERE username IN (${marks})`)
      .bind(...usernames)
      .all<{ username: string; user_id: number }>();
    for (const r of results) found.set(r.username, r.user_id);
    return found;
  }

  async forget(userId: number): Promise<void> {
    await this.d1.prepare('DELETE FROM split_contacts WHERE user_id = ?1').bind(userId).run();
  }

  async createClaim(claim: Omit<Claim, 'messageId'>): Promise<void> {
    await this.purge();
    await this.d1
      .prepare(
        `INSERT INTO split_claims (token, username, user_id, name, amount_cents, description,
           payload, organiser, chat_id, expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
      )
      .bind(
        claim.token,
        claim.username,
        claim.userId,
        claim.name,
        claim.amountCents,
        claim.description,
        claim.payload,
        claim.organiser,
        claim.chatId,
        claim.expiresAt
      )
      .run();
  }

  async getClaim(token: string, now: Date = new Date()): Promise<Claim | null> {
    await this.purge(now);
    const row = await this.d1
      .prepare('SELECT * FROM split_claims WHERE token = ?1')
      .bind(token)
      .first<Row>();
    return row ? toClaim(row) : null;
  }

  async deleteClaim(token: string): Promise<boolean> {
    const r = await this.d1.prepare('DELETE FROM split_claims WHERE token = ?1').bind(token).run();
    return (r.meta.changes ?? 0) > 0;
  }

  async claimsForMessage(chatId: number, messageId: number): Promise<Claim[]> {
    const { results } = await this.d1
      .prepare('SELECT * FROM split_claims WHERE chat_id = ?1 AND message_id = ?2 ORDER BY rowid')
      .bind(chatId, messageId)
      .all<Row>();
    return results.map(toClaim);
  }

  async setClaimsMessage(tokens: string[], messageId: number): Promise<void> {
    await this.d1.batch(
      tokens.map((t) =>
        this.d1
          .prepare('UPDATE split_claims SET message_id = ?1 WHERE token = ?2')
          .bind(messageId, t)
      )
    );
  }

  private async purge(now: Date = new Date()): Promise<void> {
    await this.d1
      .prepare('DELETE FROM split_claims WHERE expires_at <= ?1')
      .bind(now.toISOString())
      .run();
  }
}
