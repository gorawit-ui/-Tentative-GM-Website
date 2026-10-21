// D-A10-3 — the people CSV is often saved by Excel in Thai Windows, so its bytes are not always UTF-8.
// The page guesses the encoding from the bytes (UTF-8 with or without BOM, UTF-16 LE/BE, Windows-874)
// and the Admin confirms that the first rows read as Thai before choosing columns; a wrong guess can be
// overridden by choosing the encoding.
import { describe, expect, it } from 'vitest';
import { CSV_ENCODINGS, decodeCsvBytes, detectCsvEncoding } from './index';

const TEXT = 'Primary Email,ชื่อ,ทีม\r\nsomchai@tdfb.co,คุณสมชาย ใจดี,ฝ่ายผลิต\r\n';

const utf8 = (text: string) => new TextEncoder().encode(text);
const withBom = (bom: readonly number[], body: Uint8Array) => Uint8Array.from([...bom, ...body]);

function utf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < text.length; index += 1) view.setUint16(index * 2, text.charCodeAt(index), littleEndian);
  return bytes;
}

/** Windows-874 / TIS-620: ASCII as is, Thai U+0E01–U+0E5B at 0xA1–0xFB. */
function windows874(text: string): Uint8Array {
  return Uint8Array.from([...text].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) return code;
    if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e00 + 0xa0;
    throw new Error(`not in Windows-874: ${char}`);
  }));
}

describe('detectCsvEncoding / decodeCsvBytes', () => {
  it('the encodings the page offers, in order', () => {
    expect(CSV_ENCODINGS).toEqual(['utf-8', 'utf-16le', 'utf-16be', 'windows-874']);
  });

  it.each([
    ['UTF-8 with BOM', 'utf-8', withBom([0xef, 0xbb, 0xbf], utf8(TEXT))],
    ['UTF-8 without BOM', 'utf-8', utf8(TEXT)],
    ['UTF-16 LE with BOM (Excel “Unicode Text”)', 'utf-16le', withBom([0xff, 0xfe], utf16(TEXT, true))],
    ['UTF-16 BE with BOM', 'utf-16be', withBom([0xfe, 0xff], utf16(TEXT, false))],
    ['UTF-16 LE without BOM', 'utf-16le', utf16(TEXT, true)],
    ['Windows-874 (Excel “CSV” in Thai Windows)', 'windows-874', windows874(TEXT)],
  ] as const)('%s → %s, read back as the same Thai text (BOM dropped)', (_name, encoding, bytes) => {
    expect(detectCsvEncoding(bytes)).toBe(encoding);
    expect(decodeCsvBytes(bytes)).toEqual({ encoding, text: TEXT });
  });

  it('an ASCII-only file is UTF-8', () => {
    expect(decodeCsvBytes(utf8('email,name\r\na@tdfb.co,A\r\n'))).toEqual({ encoding: 'utf-8', text: 'email,name\r\na@tdfb.co,A\r\n' });
  });

  it('the Admin may override the guess (the text then is what that encoding gives)', () => {
    const bytes = windows874(TEXT);
    expect(decodeCsvBytes(bytes, 'windows-874').text).toBe(TEXT);
    // Read as UTF-8 the Thai bytes are not Thai: that is what the preview shows the Admin.
    expect(decodeCsvBytes(bytes, 'utf-8').text).not.toContain('สมชาย');
    expect(decodeCsvBytes(withBom([0xef, 0xbb, 0xbf], utf8(TEXT)), 'utf-8').text).toBe(TEXT);
  });

  it('an empty file is an empty UTF-8 text', () => {
    expect(decodeCsvBytes(new Uint8Array())).toEqual({ encoding: 'utf-8', text: '' });
  });
});
