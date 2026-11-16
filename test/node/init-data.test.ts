import { describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_SEC, verifyInitData } from '../../src/access/init-data';
import { launchFields, signInitData } from '../helpers/sign-init-data';

const TOKEN = '123456:split-token';
const NOW = 1_800_000_000;
const ann = { id: 42, first_name: 'Ann', last_name: 'Lee', username: 'ann_lee' };

describe('verifyInitData', () => {
  it('accepts launch data signed for this bot and returns the user and the link parameter', async () => {
    const data = await signInitData(TOKEN, launchFields(ann, '-100123_0', NOW));
    expect(await verifyInitData(data, TOKEN, NOW + 5)).toEqual({
      user: ann,
      startParam: '-100123_0',
      authDate: NOW,
    });
  });

  it('keeps every field in the signature, so extra fields still verify', async () => {
    const data = await signInitData(TOKEN, {
      ...launchFields(ann, 'x', NOW),
      chat_type: 'supergroup',
      chat_instance: '-1234567890',
      signature: 'abc',
    });
    expect(await verifyInitData(data, TOKEN, NOW)).not.toBeNull();
  });

  it('refuses data signed for another bot', async () => {
    const data = await signInitData('999:other', launchFields(ann, 'x', NOW));
    expect(await verifyInitData(data, TOKEN, NOW)).toBeNull();
  });

  it('refuses a changed field, a missing hash and a wrong hash', async () => {
    const data = await signInitData(TOKEN, launchFields(ann, 'chat-a', NOW));
    expect(await verifyInitData(data.replace('chat-a', 'chat-b'), TOKEN, NOW)).toBeNull();
    expect(await verifyInitData(data.replace(/&hash=.*/, ''), TOKEN, NOW)).toBeNull();
    expect(await verifyInitData(data.replace(/hash=[0-9a-f]/, 'hash=0'), TOKEN, NOW)).toBeNull();
    expect(await verifyInitData('', TOKEN, NOW)).toBeNull();
  });

  it('refuses a user swapped in by hand', async () => {
    const data = await signInitData(TOKEN, launchFields(ann, 'x', NOW));
    const swapped = data.replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":7'));
    expect(swapped).not.toBe(data);
    expect(await verifyInitData(swapped, TOKEN, NOW)).toBeNull();
  });

  it('refuses data older than 24 hours and data from the future, accepts the edges', async () => {
    const data = await signInitData(TOKEN, launchFields(ann, 'x', NOW));
    expect(await verifyInitData(data, TOKEN, NOW + INIT_DATA_MAX_AGE_SEC)).not.toBeNull();
    expect(await verifyInitData(data, TOKEN, NOW + INIT_DATA_MAX_AGE_SEC + 1)).toBeNull();
    expect(await verifyInitData(data, TOKEN, NOW - 60)).not.toBeNull();
    expect(await verifyInitData(data, TOKEN, NOW - 61)).toBeNull();
  });

  it('refuses a missing or malformed user or auth_date even when correctly signed', async () => {
    const f = launchFields(ann, 'x', NOW);
    const { user: _u, ...noUser } = f;
    for (const bad of [
      noUser,
      { ...f, user: 'not json' },
      { ...f, user: JSON.stringify({ first_name: 'Ann' }) },
      { ...f, user: JSON.stringify({ id: '42', first_name: 'Ann' }) },
      { ...f, auth_date: 'soon' },
    ]) {
      expect(await verifyInitData(await signInitData(TOKEN, bad), TOKEN, NOW)).toBeNull();
    }
  });

  it('has no link parameter when the app was opened without one', async () => {
    const { start_param: _s, ...f } = launchFields(ann, 'x', NOW);
    const data = await verifyInitData(await signInitData(TOKEN, f), TOKEN, NOW);
    expect(data?.startParam).toBeUndefined();
  });
});
