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
const admin = (async () =>
  new Response(JSON.stringify({ ok: true, result: { status: 'administrator' } }))) as typeof fetch;
const noTelegram = (async () => new Response('{}', { status: 200 })) as typeof fetch;

const FORM = { name: true, email: true, custom: ['Dietary needs', 'Company'] };

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
  const events = new D1EventRepository(env.paynow_db);
  const mk = (ref: string, formFields: string | null) =>
    events.createEvent({
      ref,
      chatId: -500,
      topicId: 0,
      name: 'Gala',
      payeeType: 'mobile',
      payeeValue: '+6591110000',
      status: 'open',
      defaultAmountCents: 2500,
      formFields,
      timestamp: '2024-01-01T00:00:00Z',
    });
  await mk('FORMEVT001', serializeFormFields(FORM));
  await mk('PLAINEVT01', null);
});

const post = (ref: string, body: unknown, userId?: number) =>
  (async () =>
    handleWeb(
      new Request(`https://x.test/api/pay/${ref}/payments`, {
        method: 'POST',
        headers: {
          Origin: 'https://x.test',
          'Content-Type': 'application/json',
          ...(userId ? { Cookie: `session=${await signSession(userId, 'sess')}` } : {}),
        },
        body: JSON.stringify(body),
      }),
      webEnv,
      noTelegram
    ))();

const good = {
  payer: '91234567',
  name: 'Ann Lee',
  email: 'ann@example.com',
  answers: ['Vegan', 'ACME'],
};

describe('payer page form fields', () => {
  it('tells the page which details to ask', async () => {
    const res = await handleWeb(new Request('https://x.test/api/pay/FORMEVT001'), webEnv);
    expect(((await res.json()) as { event: { form: unknown } }).event.form).toEqual(FORM);
    const plain = await handleWeb(new Request('https://x.test/api/pay/PLAINEVT01'), webEnv);
    expect(((await plain.json()) as { event: { form: unknown } }).event.form).toEqual({
      name: false,
      email: false,
      custom: [],
    });
  });

  it('stores the name, email and answers with their labels', async () => {
    const res = await post('FORMEVT001', good);
    expect(res.status).toBe(201);
    const ref = ((await res.json()) as { payment: { ref: string } }).payment.ref;
    const p = (await new D1Repository(env.paynow_db).getPaymentByRef(ref))!;
    expect(p.payerName).toBe('Ann Lee');
    expect(p.payerEmail).toBe('ann@example.com');
    expect(JSON.parse(p.answers!)).toEqual([
      { label: 'Dietary needs', value: 'Vegan' },
      { label: 'Company', value: 'ACME' },
    ]);
  });

  it.each([
    ['no name', { ...good, name: ' ' }, 'missing_field', 'name'],
    ['no email', { ...good, email: '' }, 'missing_field', 'email'],
    ['bad email', { ...good, email: 'ann@' }, 'invalid_email', 'email'],
    ['missing answer', { ...good, answers: ['Vegan'] }, 'missing_field', 'custom:1'],
    ['blank answer', { ...good, answers: ['Vegan', '  '] }, 'missing_field', 'custom:1'],
    ['long answer', { ...good, answers: ['x'.repeat(101), 'ACME'] }, 'invalid_field', 'custom:0'],
    ['long name', { ...good, name: 'n'.repeat(81) }, 'invalid_field', 'name'],
  ])('refuses %s and creates nothing', async (_n, body, error, field) => {
    const before = await env.paynow_db
      .prepare('SELECT COUNT(*) AS c FROM payments')
      .first<{ c: number }>();
    const res = await post('FORMEVT001', body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error, field });
    const after = await env.paynow_db
      .prepare('SELECT COUNT(*) AS c FROM payments')
      .first<{ c: number }>();
    expect(after!.c).toBe(before!.c);
  });

  it('leaves an event with no details exactly as before, and ignores details it did not ask for', async () => {
    expect((await post('PLAINEVT01', { payer: '91234567', name: '', amount: '1' })).status).toBe(
      201
    );
    const res = await post('PLAINEVT01', {
      payer: '91234567',
      name: 'Bo',
      email: 'bo@x.com',
      answers: ['a'],
    });
    const ref = ((await res.json()) as { payment: { ref: string } }).payment.ref;
    const p = (await new D1Repository(env.paynow_db).getPaymentByRef(ref))!;
    expect(p.payerEmail).toBeNull();
    expect(p.answers).toBeNull();
  });
});

describe('registrant details stay private', () => {
  it('never appear in the admin list, the payer response or the payer history', async () => {
    const created = await post(
      'FORMEVT001',
      { ...good, email: 'secret@example.com', answers: ['Peanut allergy', 'Initech'] },
      77
    );
    const createdText = await created.text();
    const session = `session=${await signSession(77, 'sess')}`;
    const history = await handleWeb(
      new Request('https://x.test/api/pay/FORMEVT001/payments', { headers: { Cookie: session } }),
      webEnv
    );
    const list = await handleWeb(
      new Request('https://x.test/api/events/FORMEVT001?limit=200', {
        headers: { Cookie: session },
      }),
      webEnv,
      admin
    );
    expect(list.status).toBe(200);
    const listText = await list.text();
    expect(listText).toContain('Ann Lee'); // the payment is listed, just without the details
    for (const text of [createdText, await history.text(), listText]) {
      expect(text).not.toContain('secret@example.com');
      expect(text).not.toContain('Peanut allergy');
      expect(text).not.toContain('Initech');
    }
  });
});
