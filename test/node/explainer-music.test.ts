import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const music = JSON.parse(
  readFileSync(new URL('../../scripts/explainer/music.json', import.meta.url), 'utf8')
) as Record<string, unknown>;

describe('explainer music settings', () => {
  it('record the track, its creator and where it came from', () => {
    for (const key of ['title', 'creator', 'sourcePage', 'url', 'licenseUrl']) {
      expect(typeof music[key]).toBe('string');
      expect((music[key] as string).length).toBeGreaterThan(0);
    }
  });

  it('use the CC0 1.0 dedication and an Internet Archive file', () => {
    expect(music.licenseUrl).toMatch(
      /^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/
    );
    expect(music.url).toMatch(/^https:\/\/archive\.org\/download\/.+\.(mp3|ogg|wav|flac)$/);
    expect(music.sourcePage).toMatch(/^https:\/\/archive\.org\/details\//);
  });

  it('start at a non-negative offset', () => {
    expect(typeof music.startSeconds).toBe('number');
    expect(music.startSeconds as number).toBeGreaterThanOrEqual(0);
  });
});
