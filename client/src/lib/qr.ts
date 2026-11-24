import qrcode from 'qrcode-generator';

/**
 * A link, drawn as the QR code that link makes.
 *
 * ---- Why the shop draws these and does not collect them ----
 *
 * A QR code is a link written as squares: knowing the link is the same thing
 * as knowing the code. Asking a customer to upload a picture of their own QR
 * asks them to do, badly, a job that can be done here exactly -- what arrives
 * is a screenshot at screen resolution, with a white margin and a watermark,
 * and whether it scans is discovered after the piece has been cut.
 *
 * Drawn from the link there is nothing to go wrong: the modules are square and
 * true at any size, the quiet zone is correct, and the customer sees the real
 * code on the real piece before paying.
 */

/** The level of damage a code can take and still read. */
export type QrStrength = 'L' | 'M' | 'Q' | 'H';

/**
 * Medium, deliberately.
 *
 * Stronger levels spend their extra bytes on more and smaller modules, and a
 * code cut or printed on a table-top piece is read by a phone held at arm's
 * length: a sparser code at a given size scans from further away than a denser
 * one. For the short links these pieces carry -- a profile, a review page --
 * medium already survives a thumbprint and a scuff.
 */
const DEFAULT_STRENGTH: QrStrength = 'M';

/**
 * What the customer typed, as the link it plainly means.
 *
 * People write instagram.com/brewandco, not https://instagram.com/brewandco.
 * Encoding that as typed produces a code a phone treats as text rather than an
 * address, which fails silently and looks exactly like a working code.
 */
export function normaliseLink(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value.replace(/^\/+/, '')}`;
}

/** Whether a link is one this can honestly turn into a code. */
export function linkLooksRight(raw: string): boolean {
  const value = normaliseLink(raw);
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    // A host with a dot in it and something either side: "brewandco" is not one.
    return /^[^.\s]+(\.[^.\s]+)+$/.test(url.hostname);
  } catch {
    return false;
  }
}

export interface QrDrawing {
  /** Modules per side, the quiet zone included. */
  size: number;
  /** Every dark module as one path, in a `size` x `size` coordinate space. */
  path: string;
}

/** The quiet zone, in modules. Four is what the specification asks for. */
const QUIET = 4;

const cache = new Map<string, QrDrawing | null>();

/**
 * The code for a link, as a single path.
 *
 * One path rather than a few hundred rects: a four-code board redrawn on every
 * keystroke is a thousand nodes the browser has to lay out, and the preview
 * updates as the customer types.
 *
 * Null when there is nothing to draw, or when the link is too long to encode --
 * which is a real answer, not a failure to report.
 */
export function qrDrawing(raw: string, strength: QrStrength = DEFAULT_STRENGTH): QrDrawing | null {
  const link = normaliseLink(raw);
  if (!link) return null;

  const key = `${strength}:${link}`;
  const seen = cache.get(key);
  if (seen !== undefined) return seen;

  let drawing: QrDrawing | null = null;
  try {
    // 0 asks for the smallest version the data fits in.
    const qr = qrcode(0, strength);
    qr.addData(link);
    qr.make();

    const count = qr.getModuleCount();
    const parts: string[] = [];
    for (let row = 0; row < count; row += 1) {
      let run = -1;
      for (let col = 0; col <= count; col += 1) {
        const dark = col < count && qr.isDark(row, col);
        if (dark && run < 0) run = col;
        if (!dark && run >= 0) {
          // One rect per unbroken run of dark modules, not one per module.
          parts.push(`M${run + QUIET} ${row + QUIET}h${col - run}v1h-${col - run}z`);
          run = -1;
        }
      }
    }
    drawing = { size: count + QUIET * 2, path: parts.join('') };
  } catch {
    /* Too much data for any version, or a character set it cannot encode. */
    drawing = null;
  }

  cache.set(key, drawing);
  return drawing;
}
