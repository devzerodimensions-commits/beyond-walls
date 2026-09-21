import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

/**
 * Storage abstraction.
 *
 * Local disk is the default and needs no configuration. Production can switch to
 * S3, Cloudflare R2 (S3-compatible) or Cloudinary purely through env vars — the
 * rest of the codebase only ever sees a public URL string, so nothing else
 * changes.
 */

export interface StoredFile {
  /** Public URL used everywhere in the app. */
  url: string;
  /** Driver-specific key, kept so the file can be deleted later. */
  key: string;
}

export interface StorageDriver {
  readonly name: string;
  put(input: { buffer: Buffer; filename: string; mimeType: string; folder: string }): Promise<StoredFile>;
  remove(urlOrKey: string): Promise<void>;
  /** True when the URL belongs to this driver. */
  owns(url: string): boolean;
}

// ---------------------------------------------------------------------------
// Local disk
// ---------------------------------------------------------------------------

class LocalDriver implements StorageDriver {
  readonly name = 'local';

  async put(input: { buffer: Buffer; filename: string; mimeType: string; folder: string }): Promise<StoredFile> {
    const dir = path.join(env.uploadDir, input.folder);
    await fs.promises.mkdir(dir, { recursive: true });
    const target = path.join(dir, input.filename);
    await fs.promises.writeFile(target, input.buffer);
    return { url: `/uploads/${input.folder}/${input.filename}`, key: `${input.folder}/${input.filename}` };
  }

  async remove(urlOrKey: string): Promise<void> {
    const relative = urlOrKey.replace(/^\/uploads\//, '');
    const target = path.normalize(path.join(env.uploadDir, relative));
    // Guard against traversal via a crafted URL.
    if (!target.startsWith(path.normalize(env.uploadDir))) return;
    await fs.promises.unlink(target).catch(() => undefined);
  }

  owns(url: string): boolean {
    return url.startsWith('/uploads/');
  }
}

// ---------------------------------------------------------------------------
// S3 / Cloudflare R2
// ---------------------------------------------------------------------------

class S3Driver implements StorageDriver {
  readonly name: string;

  // Imported lazily so the SDK is never loaded when the local driver is used.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;

  constructor(name: string) {
    this.name = name;
  }

  private async getClient() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: env.s3Region,
        ...(env.s3Endpoint ? { endpoint: env.s3Endpoint } : {}),
        // R2 and most S3-compatible providers require path-style addressing.
        ...(env.s3Endpoint ? { forcePathStyle: true } : {}),
        credentials: {
          accessKeyId: env.s3AccessKeyId,
          secretAccessKey: env.s3SecretAccessKey,
        },
      });
    }
    return this.client;
  }

  private publicBase(): string {
    if (env.s3PublicUrl) return env.s3PublicUrl.replace(/\/+$/, '');
    if (env.s3Endpoint) return `${env.s3Endpoint.replace(/\/+$/, '')}/${env.s3Bucket}`;
    return `https://${env.s3Bucket}.s3.${env.s3Region}.amazonaws.com`;
  }

  async put(input: { buffer: Buffer; filename: string; mimeType: string; folder: string }): Promise<StoredFile> {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const key = `${input.folder}/${input.filename}`;

    await client.send(
      new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        // Uploads are user content: never let the browser sniff a different type.
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return { url: `${this.publicBase()}/${key}`, key };
  }

  async remove(urlOrKey: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.getClient();
    const key = urlOrKey.startsWith('http')
      ? urlOrKey.replace(`${this.publicBase()}/`, '')
      : urlOrKey.replace(/^\//, '');
    await client
      .send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }))
      .catch(() => undefined);
  }

  owns(url: string): boolean {
    return url.startsWith(this.publicBase());
  }
}

// ---------------------------------------------------------------------------
// Cloudinary
// ---------------------------------------------------------------------------

class CloudinaryDriver implements StorageDriver {
  readonly name = 'cloudinary';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sdk: any = null;

  private async getSdk() {
    if (!this.sdk) {
      const mod = await import('cloudinary');
      const api = mod.v2;
      api.config({
        cloud_name: env.cloudinaryCloudName,
        api_key: env.cloudinaryApiKey,
        api_secret: env.cloudinaryApiSecret,
        secure: true,
      });
      this.sdk = api;
    }
    return this.sdk;
  }

  async put(input: { buffer: Buffer; filename: string; mimeType: string; folder: string }): Promise<StoredFile> {
    const api = await this.getSdk();
    const publicId = `${input.folder}/${path.parse(input.filename).name}`;

    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const stream = api.uploader.upload_stream(
        {
          public_id: publicId,
          folder: undefined, // folder is already in public_id
          resource_type: input.mimeType.startsWith('image/') ? 'image' : 'raw',
          overwrite: false,
        },
        (error: unknown, res: Record<string, unknown>) => (error ? reject(error) : resolve(res)),
      );
      stream.end(input.buffer);
    });

    return { url: String(result.secure_url), key: String(result.public_id) };
  }

  async remove(urlOrKey: string): Promise<void> {
    const api = await this.getSdk();
    // Derive the public id from a full URL when needed.
    const key = urlOrKey.startsWith('http')
      ? decodeURIComponent(urlOrKey.split('/upload/')[1]?.replace(/^v\d+\//, '').replace(/\.[^.]+$/, '') ?? '')
      : urlOrKey;
    if (!key) return;
    await api.uploader.destroy(key).catch(() => undefined);
  }

  owns(url: string): boolean {
    return url.includes('res.cloudinary.com');
  }
}

// ---------------------------------------------------------------------------

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;

  switch (env.storageDriver) {
    case 's3':
    case 'r2':
      if (!env.s3Bucket || !env.s3AccessKeyId) {
        // eslint-disable-next-line no-console
        console.warn(`[storage] STORAGE_DRIVER=${env.storageDriver} but S3 credentials are missing — using local disk.`);
        driver = new LocalDriver();
      } else {
        driver = new S3Driver(env.storageDriver);
      }
      break;

    case 'cloudinary':
      if (!env.cloudinaryCloudName || !env.cloudinaryApiSecret) {
        // eslint-disable-next-line no-console
        console.warn('[storage] STORAGE_DRIVER=cloudinary but credentials are missing — using local disk.');
        driver = new LocalDriver();
      } else {
        driver = new CloudinaryDriver();
      }
      break;

    default:
      driver = new LocalDriver();
  }

  return driver;
}

/** The local driver is always available for cleaning up legacy /uploads paths. */
export const localStorage = new LocalDriver();

export function storageName(): string {
  return getStorage().name;
}
