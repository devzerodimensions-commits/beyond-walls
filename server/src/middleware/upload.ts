import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { env } from '../config/env';
import { ApiError } from '../utils/http';
import { validateUpload, type UploadKind } from '../services/fileValidation.service';
import { optimizeImage } from '../services/image.service';
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
  /** Pixel size of the stored image. Undefined for video and for PDFs. */
  width?: number;
  height?: number;
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

  /*
   * Every raster image becomes WebP, wherever it was uploaded from -- the
   * admin panel, or the artwork a customer attaches to a custom order.
   *
   * The two use different profiles. A catalogue photograph is capped at a size
   * no layout can use and compressed for the wire. Artwork keeps every pixel it
   * arrived with and is compressed far more gently, because the piece is made
   * from it rather than looked at on a screen. A PDF is not a raster image and
   * passes straight through.
   */
  // Video is stored exactly as it arrived. There is no transcoder here, and
  // handing footage to an image optimiser would at best waste the work.
  const optimized =
    kind === 'video'
      ? null
      : await optimizeImage(
          file.buffer,
          validated.mimeType,
          kind === 'image' ? 'catalogue' : 'original',
        );

  const buffer = optimized?.converted ? optimized.buffer : file.buffer;
  const mimeType = optimized?.converted ? optimized.mimeType : validated.mimeType;
  const extension = optimized?.converted ? optimized.extension : validated.extension;

  // The stored name never reuses the caller's string, so a crafted filename
  // cannot traverse directories or introduce a second extension.
  const filename = `${validated.safeBaseName}-${nanoid(10)}${extension}`;

  const stored = await getStorage().put({
    buffer,
    filename,
    mimeType,
    folder,
  });

  return {
    url: stored.url,
    key: stored.key,
    filename,
    mimeType,
    // The stored size, not the uploaded one — this is what the media library
    // reports and what a quota would be counted against.
    size: buffer.length,
    originalName: file.originalname,
    width: optimized?.width,
    height: optimized?.height,
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

/**
 * Removes a stored file, wherever it is actually kept.
 *
 * A /uploads/ address does not say which store holds the bytes. Images
 * committed to the repository sit on disk; everything uploaded since is a row
 * in the database, because that is the driver this installation runs. Reading
 * one has always tried both, in that order -- deleting one tried only the
 * disk, so deleting a file from the media library removed its entry and left
 * the bytes exactly where they were, still being served at the same public
 * address to anyone who had the link.
 *
 * That is the part that matters. A studio deleting a photograph is often
 * deleting it BECAUSE it should not be public -- the wrong file, a customer's
 * picture, something they were sent in confidence -- and the library said it
 * was gone while the URL went on serving it.
 *
 * So both are asked, and neither failing stops the other. A store that does
 * not hold it treats the removal as already done, which is the right answer.
 */
export function deleteUploadedFile(url: string): void {
  if (!url) return;

  const configured = getStorage();
  void configured.remove(url).catch(() => undefined);

  // The disk as well, unless that is what the line above already cleared.
  if (configured.name !== 'local' && url.startsWith('/uploads/')) {
    void localStorage.remove(url).catch(() => undefined);
  }
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
