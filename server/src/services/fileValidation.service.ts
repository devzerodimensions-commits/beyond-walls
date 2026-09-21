import path from 'path';
import { ApiError } from '../utils/http';

/**
 * Upload validation.
 *
 * A browser-supplied MIME type is just a string the client chose, and an
 * extension is no better. Every upload is therefore checked three ways —
 * extension, declared MIME, and the actual bytes — and all three must agree.
 *
 * Deliberately blocked:
 *  - SVG: it is a document. It can carry <script> and run on our own origin.
 *  - application/octet-stream and any unrecognised binary.
 *  - Anything the server could be tricked into executing (.html, .js, .php,
 *    .svg, .xml) regardless of what it claims to be.
 */

export type UploadKind = 'image' | 'artwork';

/** ext -> canonical mime, for the types we accept. */
const ALLOWED: Record<UploadKind, Record<string, string>> = {
  // Customer-facing and admin image uploads.
  image: {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
  },
  // Print-ready artwork a customer may send with a custom order.
  artwork: {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
  },
};

/** Extensions refused outright, whatever they claim to be. */
const BLOCKED_EXTENSIONS = new Set([
  '.svg', '.svgz', '.xml', '.html', '.htm', '.xhtml', '.js', '.mjs', '.cjs',
  '.php', '.phtml', '.asp', '.aspx', '.jsp', '.sh', '.bash', '.bat', '.cmd',
  '.exe', '.dll', '.so', '.jar', '.py', '.rb', '.pl', '.cgi', '.htaccess',
]);

const BLOCKED_MIME = new Set([
  'image/svg+xml',
  'text/html',
  'text/xml',
  'application/xml',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/octet-stream',
  'application/x-msdownload',
]);

interface Signature {
  mime: string;
  /** Byte pattern; null entries are wildcards. */
  magic: (number | null)[];
  offset?: number;
}

/** Magic-byte signatures for every format we accept. */
const SIGNATURES: Signature[] = [
  { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  // RIFF....WEBP — bytes 8..11 identify the format.
  { mime: 'image/webp', magic: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  // ....ftypavif
  { mime: 'image/avif', magic: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], offset: 4 },
];

/** Identifies a buffer by its leading bytes, or null when unrecognised. */
export function sniffMime(buffer: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.magic.length) continue;

    let matches = true;
    for (let i = 0; i < sig.magic.length; i += 1) {
      const expected = sig.magic[i];
      if (expected !== null && buffer[offset + i] !== expected) {
        matches = false;
        break;
      }
    }
    if (matches) return sig.mime;
  }
  return null;
}

/**
 * Detects markup/script hiding inside something claiming to be an image.
 * Catches polyglot files and mislabelled SVG.
 */
export function looksLikeMarkup(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024).toString('utf8').toLowerCase().trimStart();
  return (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.startsWith('<!doctype') ||
    head.startsWith('<html') ||
    head.includes('<script') ||
    head.startsWith('<?php')
  );
}

export interface ValidatedUpload {
  extension: string;
  mimeType: string;
  safeBaseName: string;
}

/**
 * Validates one uploaded file. Throws a customer-readable ApiError on anything
 * suspicious; returns the canonical extension and MIME to store it under.
 */
export function validateUpload(
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  kind: UploadKind,
  maxBytes: number,
): ValidatedUpload {
  const extension = path.extname(file.originalname).toLowerCase();
  const declared = (file.mimetype || '').toLowerCase().split(';')[0].trim();

  if (!file.size || file.size === 0) {
    throw ApiError.badRequest(`"${file.originalname}" is empty`);
  }
  if (file.size > maxBytes) {
    throw ApiError.badRequest(
      `"${file.originalname}" is larger than the ${Math.round(maxBytes / (1024 * 1024))}MB limit`,
    );
  }

  // 1. Hard blocklist first — nothing here is ever acceptable.
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw ApiError.badRequest(
      `${extension} files are not accepted${extension === '.svg' ? ' — SVG can carry scripts. Please upload a PNG or JPG.' : ''}`,
    );
  }
  if (BLOCKED_MIME.has(declared)) {
    throw ApiError.badRequest(`"${file.originalname}" has a file type we do not accept`);
  }

  // 2. Extension must be on the allowlist for this upload kind.
  const allowed = ALLOWED[kind];
  const canonical = allowed[extension];
  if (!canonical) {
    throw ApiError.badRequest(
      `"${file.originalname}" is not a supported file type. Accepted: ${Object.keys(allowed).join(', ')}`,
    );
  }

  // 3. The declared MIME must agree with the extension.
  if (declared && declared !== canonical) {
    // jpg/jpeg and a couple of legacy aliases are the only tolerated mismatches.
    const aliases: Record<string, string[]> = {
      'image/jpeg': ['image/jpg', 'image/pjpeg'],
      'image/png': ['image/x-png'],
    };
    if (!(aliases[canonical] ?? []).includes(declared)) {
      throw ApiError.badRequest(
        `"${file.originalname}" claims to be ${declared} but has a ${extension} extension`,
      );
    }
  }

  // 4. The bytes must actually be that format.
  const sniffed = sniffMime(file.buffer);
  if (!sniffed) {
    throw ApiError.badRequest(
      `"${file.originalname}" is not a valid ${extension.replace('.', '').toUpperCase()} file`,
    );
  }
  if (sniffed !== canonical) {
    throw ApiError.badRequest(
      `"${file.originalname}" is really a ${sniffed} file, not ${canonical}`,
    );
  }

  // 5. No markup smuggled into an "image".
  if (looksLikeMarkup(file.buffer)) {
    throw ApiError.badRequest(`"${file.originalname}" contains markup and cannot be accepted`);
  }

  const safeBaseName =
    path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'file';

  return { extension, mimeType: canonical, safeBaseName };
}

/** Extensions offered in the browser file picker. */
export function acceptAttribute(kind: UploadKind): string {
  return Object.keys(ALLOWED[kind]).join(',');
}
