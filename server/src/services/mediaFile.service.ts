import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import prisma from '../lib/prisma';
import { getStorage } from './storage.service';

/**
 * Reading and replacing a stored file by its key.
 *
 * The storage drivers deliberately only know how to `put` and `remove`: the
 * rest of the app passes URLs around and never needs the bytes back. The image
 * editor does — it has to read a file, transform it and write the result to the
 * same key — so the two operations live here rather than being bolted onto an
 * interface that four drivers would then have to implement.
 *
 * Disk is checked before the database, which is the order /uploads itself
 * serves them in: images committed to the repository live on disk, anything
 * uploaded since is a row, and both answer on the same URL.
 */

export interface StoredBytes {
  buffer: Buffer;
  mimeType: string;
}

/** `/uploads/logo/x.webp` and `logo/x.webp` both mean the same file. */
export function toKey(urlOrKey: string): string {
  return urlOrKey.replace(/^\/uploads\//, '').replace(/^\/+/, '');
}

function diskPathFor(key: string): string | null {
  const root = path.resolve(env.uploadDir);
  const target = path.resolve(path.join(root, key));
  // A key is never allowed to climb out of the upload directory.
  return target.startsWith(root + path.sep) || target === root ? target : null;
}

export async function readStored(urlOrKey: string): Promise<StoredBytes | null> {
  const key = toKey(urlOrKey);
  if (!key) return null;

  const onDisk = diskPathFor(key);
  if (onDisk && fs.existsSync(onDisk)) {
    try {
      return { buffer: await fs.promises.readFile(onDisk), mimeType: mimeFromKey(key) };
    } catch {
      /* fall through to the database */
    }
  }

  const blob = await prisma.mediaBlob.findUnique({ where: { key } });
  return blob ? { buffer: Buffer.from(blob.bytes), mimeType: blob.mimeType } : null;
}

/**
 * Replaces the bytes under an existing key.
 *
 * Writes back to wherever the file already is, so editing a repository image
 * in development touches the file and editing an uploaded one touches its row.
 * The blob's version is bumped on every write: a key that has been rewritten
 * is no longer content-addressed and must stop being served as immutable, and
 * that counter is how the upload handler knows.
 */
export async function replaceStored(
  urlOrKey: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const key = toKey(urlOrKey);
  if (!key) throw new Error('replaceStored needs a key');

  const onDisk = diskPathFor(key);
  if (onDisk && fs.existsSync(onDisk)) {
    await fs.promises.writeFile(onDisk, buffer);
    return;
  }

  const bytes = new Uint8Array(buffer);
  const existing = await prisma.mediaBlob.findUnique({ where: { key }, select: { version: true } });
  if (!existing) throw new Error(`no stored file at ${key}`);

  await prisma.mediaBlob.update({
    where: { key },
    data: { bytes, size: bytes.length, mimeType, version: existing.version + 1 },
  });
}

/**
 * Keeps a copy of a file under a key of its own, for the undo.
 *
 * Goes through the ordinary storage driver, so the copy lands wherever
 * everything else does and is removed by the same code paths.
 */
export async function backupStored(urlOrKey: string, filename: string): Promise<string> {
  const key = toKey(urlOrKey);
  const source = await readStored(key);
  if (!source) throw new Error(`no stored file at ${key}`);

  const stored = await getStorage().put({
    buffer: source.buffer,
    filename,
    mimeType: source.mimeType,
    folder: 'originals',
  });
  return stored.key;
}

function mimeFromKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  const map: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
  };
  return map[ext] ?? 'application/octet-stream';
}
