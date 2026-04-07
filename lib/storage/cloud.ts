import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import type { StorageAdapter, FileStat } from './types';

/**
 * CloudStorageAdapter — wraps Cloudflare R2 (S3-compatible) operations.
 * Used when DRIFTGRID_MODE is 'cloud'.
 *
 * All paths are scoped to a workspace prefix:
 *   {workspace_id}/{relative_path}
 */
export class CloudStorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(workspaceId: string) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.bucket = process.env.R2_BUCKET_NAME || 'driftgrid-files';
    this.prefix = `${workspaceId}/`;
  }

  private key(relativePath: string): string {
    // Normalize path separators and remove leading dots/slashes
    const clean = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
    return this.prefix + clean;
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.key(relativePath),
    }));
    const bytes = await response.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async readTextFile(relativePath: string): Promise<string> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.key(relativePath),
    }));
    return await response.Body!.transformToString('utf-8');
  }

  async writeFile(relativePath: string, data: Buffer | Uint8Array): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(relativePath),
      Body: data,
    }));
  }

  async writeTextFile(relativePath: string, content: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.key(relativePath),
      Body: content,
      ContentType: relativePath.endsWith('.html') ? 'text/html; charset=utf-8'
        : relativePath.endsWith('.json') ? 'application/json'
        : relativePath.endsWith('.md') ? 'text/markdown'
        : 'text/plain; charset=utf-8',
    }));
  }

  async copyFile(srcRelative: string, destRelative: string): Promise<void> {
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: this.key(destRelative),
      CopySource: `${this.bucket}/${this.key(srcRelative)}`,
    }));
  }

  async listDir(relativePath: string): Promise<string[]> {
    let prefix = this.key(relativePath);
    if (!prefix.endsWith('/')) prefix += '/';
    // Handle root listing
    if (relativePath === '.' || relativePath === '') {
      prefix = this.prefix;
    }

    const response = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      Delimiter: '/',
    }));

    const entries: string[] = [];

    // Add "directories" (common prefixes)
    if (response.CommonPrefixes) {
      for (const cp of response.CommonPrefixes) {
        if (cp.Prefix) {
          // Extract just the directory name
          const name = cp.Prefix.slice(prefix.length).replace(/\/$/, '');
          if (name) entries.push(name);
        }
      }
    }

    // Add "files" (objects at this level)
    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key) {
          const name = obj.Key.slice(prefix.length);
          // Only include direct children (no nested slashes)
          if (name && !name.includes('/')) {
            entries.push(name);
          }
        }
      }
    }

    return entries;
  }

  async mkdir(_relativePath: string): Promise<void> {
    // R2/S3 doesn't have real directories — they're implied by key prefixes.
    // No-op, but kept for interface compatibility.
  }

  async stat(relativePath: string): Promise<FileStat | null> {
    // First try as a file
    try {
      const response = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
      }));
      return {
        isDirectory: false,
        mtimeMs: response.LastModified ? response.LastModified.getTime() : Date.now(),
        size: response.ContentLength ?? 0,
      };
    } catch {
      // Not a file — check if it's a "directory" (has objects with this prefix)
    }

    // Check if it's a directory prefix
    let prefix = this.key(relativePath);
    if (!prefix.endsWith('/')) prefix += '/';

    try {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: 1,
      }));
      if (response.Contents && response.Contents.length > 0) {
        return {
          isDirectory: true,
          mtimeMs: Date.now(),
          size: 0,
        };
      }
    } catch {
      // Not found
    }

    return null;
  }

  async exists(relativePath: string): Promise<boolean> {
    const s = await this.stat(relativePath);
    return s !== null;
  }

  resolvePath(_relativePath: string): string | null {
    // Cloud storage doesn't have local filesystem paths
    return null;
  }

  validatePath(relativePath: string): string | null {
    // Basic validation — no path traversal
    if (relativePath.includes('..')) return null;
    return relativePath;
  }
}
