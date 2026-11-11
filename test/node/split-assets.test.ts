import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

describe('the Split page images', () => {
  it('the logo is a small PNG with a transparent background', () => {
    const png = PNG.sync.read(readFileSync('web/public/split-logo.png'));
    expect(png.width).toBeLessThanOrEqual(128);
    expect(png.height).toBeLessThanOrEqual(128);
    expect(png.data[3]).toBe(0); // the top-left corner is fully transparent
    expect(readFileSync('web/public/split-logo.png').length).toBeLessThan(60_000);
  });

  it('the preview is a 1280 by 720 JPEG under 200 KB', () => {
    const jpg = readFileSync('web/public/split-preview.jpg');
    expect(jpg.length).toBeLessThan(200_000);
    // find the start-of-frame marker and read the height and width after it
    let i = 2;
    let size: [number, number] | undefined;
    while (i < jpg.length) {
      const marker = jpg[i + 1]!;
      const length = jpg.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        size = [jpg.readUInt16BE(i + 7), jpg.readUInt16BE(i + 5)];
        break;
      }
      i += 2 + length;
    }
    expect(jpg.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(size).toEqual([1280, 720]);
  });

  it('both are served by the site itself, not through the Function', () => {
    const routes = JSON.parse(readFileSync('web/public/_routes.json', 'utf8')) as {
      exclude: string[];
    };
    expect(routes.exclude).toContain('/split-logo.png');
    expect(routes.exclude).toContain('/split-preview.jpg');
  });
});
