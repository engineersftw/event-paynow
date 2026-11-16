import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { D1EventRepository, D1Repository } from '../../src/db/drizzle-repository';
import { serializeFormFields } from '../../src/payments/form-fields';
import { signSession } from '../../src/web/auth';
import { handleWeb, type WebEnv } from '../../src/web/handler';
import { applyTestSchema } from './harness';

const webEnv: WebEnv = {
  paynow_db: env.paynow_db,
  TELEGRAM_BOT_TOKEN: 'tok',
  SESSION_SECRET: 'sess',
  BOT_USERNAME: 'my_bot',
};
const as = (status: string) =>
  (async () => new Response(JSON.stringify({ ok: true, result: { status } }))) as typeof fetch;

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  const events = new D1EventRepository(env.paynow_db);
  const repo = new D1Repository(env.paynow_db);
  const event = await events.createEvent({
    ref: 'CSVEVT0001',
    chatId: -700,
    topicId: 0,
    name: 'Retreat',
    payeeType: 'mobile',
    payeeValue: '+6591110000',
    status: 'open',
    formFields: serializeFormFields({ name: true, email: true, custom: ['Company'] }),
    timestamp: '2024-01-01T00:00:00Z',
  });
  const pay = (
    ref: string,
    status: 'pending' | 'voided',
    name: string,
    email: string,
    company: string
  ) =>
    repo.createPayment({
      ref,
      userId: 0,
      eventId: event.id,
      description: 'Retreat',
      amountCents: 2000,
      payeeType: 'mobile',
      payeeValue: '+6591110000',
      status,
      source: 'manual',
      qrPayload: 'p',
      payerType: 'mobile',
      payerValue: '+6598887777',
      payerName: name,
      payerEmail: email,
      answers: JSON.stringify([{ label: 'Company', value: company }]),
      timestamp: `2024-01-01T00:00:0${ref.endsWith('1') ? 1 : 2}Z`,
    });
  await pay('CSVPAY0001', 'pending', 'Ann Lee', 'ann@example.com', 'ACME, Inc');
  await pay('CSVPAY0002', 'voided', '=cmd|x', 'bo@example.com', 'Initech');
});

const get = async (
  ref: string,
  opts: { user?: number; bearer?: boolean; fetchFn?: typeof fetch }
) => {
  const headers: Record<string, string> = {};
  if (opts.user) {
    const token = await signSession(opts.user, 'sess');
    if (opts.bearer) headers.Authorization = `Bearer ${token}`;
    else headers.Cookie = `session=${token}`;
  }
  return handleWeb(
    new Request(`https://x.test/api/events/${ref}/export.csv`, { headers }),
    webEnv,
    opts.fetchFn ?? as('administrator')
  );
};

describe('GET /api/events/:ref/export.csv', () => {
  it('gives an admin the registrants file, voided rows marked, no PayNow numbers', async () => {
    const res = await get('CSVEVT0001', { user: 9 });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="event-CSVEVT0001.csv"'
    );
    const lines = (await res.text()).slice(1).split('\r\n');
    expect(lines[0]).toBe(
      '"Reference","Created","Status","Amount (SGD)","Name","Email","Company","Checked in"'
    );
    expect(lines[1]).toContain('"CSVPAY0001"');
    expect(lines[1]).toContain('"Ann Lee","ann@example.com","ACME, Inc"');
    expect(lines[2]).toContain('"voided"');
    expect(lines[2]).toContain(`"'=cmd|x"`); // formula neutralised
    expect(lines.join('')).not.toContain('6598887777');
  });

  it('works with the Mini App bearer session and no cookie', async () => {
    expect((await get('CSVEVT0001', { user: 9, bearer: true })).status).toBe(200);
  });

  it('refuses a chat member who is not an admin, and a visitor who is not signed in', async () => {
    const member = await get('CSVEVT0001', { user: 9, fetchFn: as('member') });
    expect(member.status).toBe(403);
    expect(await member.text()).not.toContain('ann@example.com');
    const anon = await get('CSVEVT0001', {});
    expect(anon.status).toBe(401);
    expect(await anon.text()).not.toContain('ann@example.com');
  });

  it('404s for an unknown event', async () => {
    expect((await get('NOSUCHEVT1', { user: 9 })).status).toBe(404);
  });
});
