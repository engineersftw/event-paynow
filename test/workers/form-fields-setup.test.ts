import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBot } from '../../src/bot';
import { parseFormFields } from '../../src/commands/form-fields';
import { D1EventRepository } from '../../src/db/drizzle-repository';
import type { Env as WorkerEnv } from '../../src/env';
import {
  applyTestSchema,
  callbackUpdate,
  TEST_BOT_INFO,
  TelegramStub,
  textUpdate,
} from './harness';

beforeAll(async () => {
  await applyTestSchema(env.paynow_db);
});

const stub = new TelegramStub();
beforeEach(() => stub.reset());
const bot = () =>
  createBot(env as unknown as WorkerEnv, { botInfo: TEST_BOT_INFO, client: { fetch: stub.fetch } });
const events = () => new D1EventRepository(env.paynow_db);

type Btn = { text: string; callback_data: string };
type Markup = { inline_keyboard: Btn[][] } | undefined;
/** What the user sees now: the newest sent or edited message, and its buttons. */
let cur = { text: '', kb: [] as Btn[] };
async function send(
  b: ReturnType<typeof bot>,
  update: Parameters<ReturnType<typeof bot>['handleUpdate']>[0]
) {
  const sent = stub.sentMessages.length;
  const edited = stub.editedMessages.length;
  await b.handleUpdate(update);
  const m =
    stub.sentMessages.length > sent
      ? stub.sentMessages.at(-1)!
      : stub.editedMessages.length > edited
        ? stub.editedMessages.at(-1)!
        : null;
  if (m)
    cur = { text: m.text ?? '', kb: ((m.replyMarkup as Markup)?.inline_keyboard ?? []).flat() };
}
const say = (b: ReturnType<typeof bot>, chat: number, text: string) =>
  send(b, textUpdate(chat, text));
const tap = (b: ReturnType<typeof bot>, chat: number, text: string) =>
  send(b, callbackUpdate(chat, cur.kb.find((x) => x.text.includes(text))!.callback_data));

async function seed(ref: string, chatId: number) {
  await events().createEvent({
    ref,
    chatId,
    topicId: 0,
    name: 'Dinner',
    payeeType: 'mobile',
    payeeValue: '+6591234567',
    status: 'open',
    timestamp: '2024-01-01T00:00:00Z',
  });
}
const formOf = async (ref: string) =>
  parseFormFields((await events().getEventByRef(ref))!.formFields);

describe('/edit_event form fields', () => {
  it('switches Full name and Email on and off, each saved at once', async () => {
    const chat = 930000001;
    await seed('EVT-FORM-1', chat);
    const b = bot();
    await say(b, chat, '/edit_event');
    await tap(b, chat, 'Form fields');
    expect(cur.text).toContain('The payment page asks: nothing extra');

    await tap(b, chat, 'Full name');
    expect(await formOf('EVT-FORM-1')).toMatchObject({ name: true, email: false });
    await tap(b, chat, 'Email');
    expect(await formOf('EVT-FORM-1')).toMatchObject({ name: true, email: true });
    await tap(b, chat, 'Full name');
    expect(await formOf('EVT-FORM-1')).toMatchObject({ name: false, email: true });
    await tap(b, chat, 'Done');
    expect(cur.text).toContain('The payment page asks: Email');
  });

  it('adds a custom field by its typed name, refuses repeats and a fourth, and removes one', async () => {
    const chat = 930000002;
    await seed('EVT-FORM-2', chat);
    const b = bot();
    await say(b, chat, '/edit_event');
    await tap(b, chat, 'Form fields');

    await tap(b, chat, 'Add field');
    await say(b, chat, 'Dietary needs');
    expect((await formOf('EVT-FORM-2')).custom).toEqual(['Dietary needs']);
    expect(cur.text).toContain('Dietary needs');

    await tap(b, chat, 'Add field');
    await say(b, chat, 'dietary NEEDS');
    expect(cur.text).toContain('already there');
    expect((await formOf('EVT-FORM-2')).custom).toEqual(['Dietary needs']);
    await say(b, chat, 'Company');
    await tap(b, chat, 'Add field');
    await say(b, chat, 'Table');
    expect((await formOf('EVT-FORM-2')).custom).toEqual(['Dietary needs', 'Company', 'Table']);
    expect(cur.kb.some((x) => x.text.includes('Add field'))).toBe(false); // limit reached

    await tap(b, chat, 'Company');
    expect((await formOf('EVT-FORM-2')).custom).toEqual(['Dietary needs', 'Table']);
  });

  it('refuses an over-long label and leaves the event alone', async () => {
    const chat = 930000003;
    await seed('EVT-FORM-3', chat);
    const b = bot();
    await say(b, chat, '/edit_event');
    await tap(b, chat, 'Form fields');
    await tap(b, chat, 'Add field');
    await say(b, chat, 'x'.repeat(31));
    expect(cur.text).toContain('1 to 30 characters');
    expect(await formOf('EVT-FORM-3')).toEqual({ name: false, email: false, custom: [] });
  });
});

describe('/init form fields', () => {
  it('shows the switches on the confirmation and stores the chosen ones', async () => {
    const chat = 930000010;
    const b = bot();
    await say(b, chat, '/init');
    await say(b, chat, 'Workshop');
    await say(b, chat, '91234567');
    await tap(b, chat, 'Skip'); // default amount
    await tap(b, chat, 'Skip'); // website
    expect(cur.kb.map((x) => x.text)).toEqual(
      expect.arrayContaining(['⬜ Full name', '⬜ Email', '✅ Confirm'])
    );

    await tap(b, chat, 'Email');
    expect(cur.text).toContain('Payers fill in: Email');
    await tap(b, chat, 'Confirm');

    const list = await events().listOpenEventsByChat(chat, 0);
    expect(parseFormFields(list[0]!.formFields)).toEqual({ name: false, email: true, custom: [] });
  });

  it('asks nothing when no switch is tapped', async () => {
    const chat = 930000011;
    const b = bot();
    await say(b, chat, '/init');
    await say(b, chat, 'Plain');
    await say(b, chat, '91234567');
    await tap(b, chat, 'Skip');
    await tap(b, chat, 'Skip');
    await tap(b, chat, 'Confirm');
    expect((await events().listOpenEventsByChat(chat, 0))[0]!.formFields).toBeNull();
  });
});
