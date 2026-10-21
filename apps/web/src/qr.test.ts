// A11 — the QR image of an area is drawn here, from a free MIT encoder in the bundle (no QR web service,
// no monthly QR product — Part 6 §6.2). A decoder (test only) reads the drawn modules back: the image
// says exactly the link {base URL}/q/{qr_id}, nothing more.
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { QR_QUIET_ZONE, qrMatrix, qrSvgPath } from './qr';

/** RGBA pixels of the matrix, `scale` px per module, with the quiet zone around it. */
function pixels(matrix: readonly (readonly boolean[])[], scale: number): { data: Uint8ClampedArray; size: number } {
  const size = (matrix.length + 2 * QR_QUIET_ZONE) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const offset = (((y + QR_QUIET_ZONE) * scale + dy) * size + (x + QR_QUIET_ZONE) * scale + dx) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }),
  );
  return { data, size };
}

describe('qrMatrix', () => {
  it.each(['https://gm.tdfb.co/q/Qr1234567890abcdefghij', 'http://127.0.0.1:4173/q/A-b_C9xxxxxxxxxxxxxxxx'])('reads back as the same link: %s', (link) => {
    const matrix = qrMatrix(link);
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
    const { data, size } = pixels(matrix, 4);
    expect(jsQR(data, size, size)?.data).toBe(link);
  });

  it('error correction M: a short link stays a small, easy-to-scan code (at most version 4, 33 modules)', () => {
    expect(qrMatrix('https://gm.tdfb.co/q/Qr1234567890abcdefghij').length).toBeLessThanOrEqual(33);
  });
});

describe('qrSvgPath', () => {
  it('one 1×1 square per dark module, offset by the quiet zone', () => {
    const path = qrSvgPath([
      [true, false],
      [false, true],
    ]);
    expect(path).toBe(`M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1z M${QR_QUIET_ZONE + 1} ${QR_QUIET_ZONE + 1}h1v1h-1z`);
  });
});

describe('qrSvgDocument', () => {
  it('a sample download carries the watermark across the code; the final one does not', async () => {
    const { qrSvgDocument } = await import('./qr');
    expect(qrSvgDocument('https://gm-dev.tdfb.co/q/Qr1234567890abcdefghij', 'QR ของ WH300', 'ตัวอย่าง ห้ามพิมพ์ติดจริง')).toContain('>ตัวอย่าง ห้ามพิมพ์ติดจริง</text>');
    expect(qrSvgDocument('https://gm.tdfb.co/q/Qr1234567890abcdefghij', 'QR ของ WH300')).not.toContain('<text');
  });

  it('the title is escaped', async () => {
    const { qrSvgDocument } = await import('./qr');
    expect(qrSvgDocument('https://gm.tdfb.co/q/Qr1234567890abcdefghij', 'A & <B>')).toContain('<title>A &amp; &lt;B&gt;</title>');
  });
});
