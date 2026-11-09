import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_TEXT } from '../../src/bot';

type Scene = {
  id: string;
  chapter: string;
  start: number;
  end: number;
  text: string;
  commands: string[];
};
const { scenes } = JSON.parse(
  readFileSync(new URL('../../scripts/explainer/captions.json', import.meta.url), 'utf8')
) as { scenes: Scene[] };

describe('explainer video captions', () => {
  it('only name commands that exist in the bot help text', () => {
    const named = scenes.flatMap((s) => s.commands);
    expect(named.length).toBeGreaterThan(0);
    for (const cmd of named) expect(HELP_TEXT).toContain(`${cmd} `);
  });

  it('mention every command listed on a scene in its caption text', () => {
    for (const s of scenes) for (const cmd of s.commands) expect(s.text).toContain(cmd);
  });

  it('cover the organizer chapter before the attendee chapter, 60 to 90 seconds in all', () => {
    const chapters = [...new Set(scenes.map((s) => s.chapter))];
    expect(chapters).toEqual(['Intro', 'Event Organizer', 'Attendee']);
    const org = scenes
      .filter((s) => s.chapter === 'Event Organizer')
      .map((s) => s.text.toLowerCase())
      .join(' ');
    for (const word of ['/init', 'received', 'check-in', '/payback']) expect(org).toContain(word);
    const att = scenes
      .filter((s) => s.chapter === 'Attendee')
      .map((s) => s.text.toLowerCase())
      .join(' ');
    for (const word of ['qr', 'banking app', 'keep the qr']) expect(att).toContain(word);
    const total = scenes.at(-1)!.end;
    expect(total).toBeGreaterThanOrEqual(60);
    expect(total).toBeLessThanOrEqual(90);
  });

  it('are contiguous (no gaps or overlaps between scenes)', () => {
    scenes.forEach((s, i) => {
      expect(s.end).toBeGreaterThan(s.start);
      if (i > 0) expect(s.start).toBe(scenes[i - 1]!.end);
    });
  });
});
