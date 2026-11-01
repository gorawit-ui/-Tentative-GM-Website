// D-A10-3 — the bytes of a people CSV as text. Excel in Thai Windows saves “CSV” as Windows-874 and
// “Unicode Text” as UTF-16 LE, so the page guesses from the bytes: a BOM decides; otherwise UTF-16 is
// recognised by its zero bytes, text that is valid UTF-8 is UTF-8, and anything else is read as
// Windows-874. The Admin sees the first rows and confirms (or picks another encoding) before mapping.
export const CSV_ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'windows-874'] as const;
export type CsvEncoding = (typeof CSV_ENCODINGS)[number];

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) => prefix.every((byte, index) => bytes[index] === byte);

/** Share of zero bytes at even / odd positions in the first 512 bytes (ASCII in UTF-16 has one per character). */
function zeroBytes(bytes: Uint8Array): { readonly even: number; readonly odd: number } {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  let even = 0;
  let odd = 0;
  for (let index = 0; index < sample.length; index += 1) {
    if (sample[index] !== 0) continue;
    if (index % 2 === 0) even += 1;
    else odd += 1;
  }
  const half = Math.max(1, sample.length / 2);
  return { even: even / half, odd: odd / half };
}

function isUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function detectCsvEncoding(bytes: Uint8Array): CsvEncoding {
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) return 'utf-8';
  if (startsWith(bytes, [0xff, 0xfe])) return 'utf-16le';
  if (startsWith(bytes, [0xfe, 0xff])) return 'utf-16be';
  const zeros = zeroBytes(bytes);
  if (zeros.odd > 0.3 && zeros.even < 0.05) return 'utf-16le';
  if (zeros.even > 0.3 && zeros.odd < 0.05) return 'utf-16be';
  return isUtf8(bytes) ? 'utf-8' : 'windows-874';
}

/** The text of the file in `encoding` (guessed when not given); a BOM of that encoding is dropped. */
export function decodeCsvBytes(bytes: Uint8Array, encoding: CsvEncoding = detectCsvEncoding(bytes)): { readonly encoding: CsvEncoding; readonly text: string } {
  // TextDecoder drops a matching BOM itself (ignoreBOM: false).
  return { encoding, text: new TextDecoder(encoding).decode(bytes) };
}
