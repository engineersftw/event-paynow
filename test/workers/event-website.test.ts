import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository } from '../../src/db/drizzle-repository';
import { signSession } from '../../src/web/auth';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { applyTestSchema } from './harness';

const webEnv: WebEnv = {
  paynow_db: env.paynow_db,
  TELEGRAM_BOT_TOKEN: 'tok',
  SESSION_SECRET: 'sess',
  BOT_USERNAME: 'my_bot',
};
const admin = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }))) as typeof fetch;
const T = '2024-01-01T00:00:00Z';
let events: D1EventRepository;

const base = (ref: string) => ({
  ref,
  chatId: -4242,
  topicId: 0,
  name: 'Dinner',
  payeeType: 'mobile' as const,
  payeeValue: '+6591110000',
  status: 'open' as const,
  timestamp: T,
});

async function adminJson(ref: string) {
  const res = await handleWeb(
    new Request(`https://x.test/api/events/${ref}`, {
      headers: { Cookie: `session=${await signSession(99, 'sess')}` },
    }),
    webEnv,
    admin
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { event: { websiteUrl: string | null } };
}

async function payerJson(ref: string) {
  const res = await handleWeb(new Request(`https://x.test/api/pay/${ref}`), webEnv);
  expect(res.status).toBe(200);
  return (await res.json()) as { event: { websiteUrl: string | null } };
}

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  events = new D1EventRepository(env.paynow_db);
});

describe('event website in the repository', () => {
  it('stores a website on create, and none when it is not given', async () => {
    const withSite = await events.createEvent({
      ...base('WEBSITE001'),
      websiteUrl: 'https://example.com/dinner',
    });
    expect(withSite.websiteUrl).toBe('https://example.com/dinner');
    expect((await events.getEventByRef('WEBSITE001'))?.websiteUrl).toBe(
      'https://example.com/dinner'
    );

    const without = await events.createEvent(base('WEBSITE002'));
    expect(without.websiteUrl).toBeNull();
    const explicitNull = await events.createEvent({ ...base('WEBSITE003'), websiteUrl: null });
    expect(explicitNull.websiteUrl).toBeNull();
  });

  it('updates and clears the website without touching other fields', async () => {
    await events.createEvent({ ...base('WEBSITE004'), websiteUrl: 'https://example.com/a' });
    const changed = await events.updateEvent('WEBSITE004', { websiteUrl: 'https://example.com/b' });
    expect(changed?.websiteUrl).toBe('https://example.com/b');
    expect(changed?.name).toBe('Dinner');
    const cleared = await events.updateEvent('WEBSITE004', { websiteUrl: null });
    expect(cleared?.websiteUrl).toBeNull();
    expect((await events.getEventByRef('WEBSITE004'))?.websiteUrl).toBeNull();
  });

  it('reads rows from before the column existed as having no website', async () => {
    await env.paynow_db
      .prepare(
        `INSERT INTO events (ref, chat_id, topic_id, name, payee_type, payee_value, status, created_at)
         VALUES ('WEBSITE005', 1, 0, 'Old event', 'mobile', '+6591110000', 'open', ?1)`
      )
      .bind(T)
      .run();
    expect((await events.getEventByRef('WEBSITE005'))?.websiteUrl).toBeNull();
  });

  it('does not change a closed event', async () => {
    await events.createEvent({ ...base('WEBSITE006'), websiteUrl: 'https://example.com/keep' });
    await events.closeEvent('WEBSITE006', T);
    expect(await events.updateEvent('WEBSITE006', { websiteUrl: null })).toBeNull();
    expect((await events.getEventByRef('WEBSITE006'))?.websiteUrl).toBe('https://example.com/keep');
  });
});

describe('event website in the web JSON', () => {
  it('is in the admin and payer data when set, and null when not', async () => {
    await events.createEvent({
      ...base('WEBJSON001'),
      websiteUrl: 'https://www.example.com/dinner',
    });
    await events.createEvent(base('WEBJSON002'));

    expect((await adminJson('WEBJSON001')).event.websiteUrl).toBe('https://www.example.com/dinner');
    expect((await payerJson('WEBJSON001')).event.websiteUrl).toBe('https://www.example.com/dinner');
    expect((await adminJson('WEBJSON002')).event.websiteUrl).toBeNull();
    expect((await payerJson('WEBJSON002')).event.websiteUrl).toBeNull();
  });

  it('keeps showing the website for a closed event on the payment page data', async () => {
    await events.createEvent({ ...base('WEBJSON003'), websiteUrl: 'https://example.com/closed' });
    await events.closeEvent('WEBJSON003', T);
    const data = await payerJson('WEBJSON003');
    expect(data.event.websiteUrl).toBe('https://example.com/closed');
  });
});
