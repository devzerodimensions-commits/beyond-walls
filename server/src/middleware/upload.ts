import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { ApiError } from '../utils/http';
import { validateUpload, type UploadKind } from '../services/fileValidation.service';
import { getStorage, localStorage } from '../services/storage.service';

export const UPLOAD_FOLDERS = [
  'products',
  'categories',
  'banners',
  'gallery',
  'personalization',
  'logo',
  'pages',
  'testimonials',
  'general',
] as const;

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export function resolveFolder(raw: unknown): UploadFolder {
  const candidate = String(raw ?? 'general');
  return (UPLOAD_FOLDERS as readonly string[]).includes(candidate)
    ? (candidate as UploadFolder)
    : 'general';
}

/**
 * Files are buffered in memory, never written straight to disk.
 *
 * This is what makes real validation possible: the bytes are inspected BEFORE
 * anything is persisted, so a disguised script never touches the filesystem.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadMb * 1024 * 1024,
    files: 12,
    fields: 40,
    parts: 60,
  },
  fileFilter(_req, file, cb) {
    // A cheap extension gate; the real check runs after the buffer exists.
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ext) return cb(ApiError.badRequest(`"${file.originalname}" has no file extension`) as unknown as Error);
    return cb(null, true);
  },
});

export interface PersistedUpload {
  url: string;
  key: string;
  filename: string;
  mimeType: string;
  size: number;
  originalName: string;
}

/**
 * Validates and stores one uploaded file through the configured storage driver.
 * Throws before anything is written if the file is not what it claims to be.
 */
export async function persistUpload(
  file: Express.Multer.File,
  kind: UploadKind,
  folder: UploadFolder,
): Promise<PersistedUpload> {
  const maxBytes = env.maxUploadMb * 1024 * 1024;
  const validated = validateUpload(
    {
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    },
    kind,
    maxBytes,
  );

  // The stored name never reuses the caller's string, so a crafted filename
  // cannot traverse directories or introduce a second extension.
  const filename = `${validated.safeBaseName}-${nanoid(10)}${validated.extension}`;

  const stored = await getStorage().put({
    buffer: file.buffer,
    filename,
    mimeType: validated.mimeType,
    folder,
  });

  return {
    url: stored.url,
    key: stored.key,
    filename,
    mimeType: validated.mimeType,
    size: file.size,
    originalName: file.originalname,
  };
}

/** Validates and stores a batch, rejecting the whole batch if any file fails. */
export async function persistUploads(
  files: Express.Multer.File[],
  kind: UploadKind,
  folder: UploadFolder,
): Promise<PersistedUpload[]> {
  const out: PersistedUpload[] = [];
  for (const file of files) {
    // Sequential so the first bad file stops the batch before more is written.
    out.push(await persistUpload(file, kind, folder));
  }
  return out;
}

/** Removes a stored file. Handles both driver URLs and legacy /uploads paths. */
export function deleteUploadedFile(url: string): void {
  if (!url) return;
  if (url.startsWith('/uploads/')) {
    void localStorage.remove(url);
    return;
  }
  void getStorage().remove(url).catch(() => undefined);
}

export function ensureUploadDirs(): void {
  const ensure = (dir: string) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  };
  ensure(env.uploadDir);
  for (const folder of UPLOAD_FOLDERS) ensure(path.join(env.uploadDir, folder));
}

/** @deprecated Kept so older call sites still compile; prefer persistUpload. */
export function publicUrlFor(file: Express.Multer.File & { storedUrl?: string }): string {
  if (file.storedUrl) return file.storedUrl;
  throw new Error('publicUrlFor requires a file persisted via persistUpload');
}
