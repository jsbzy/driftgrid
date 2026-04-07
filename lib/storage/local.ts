import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter, FileStat } from './types';

/**
 * LocalStorageAdapter — wraps Node.js filesystem operations.
 * Used when DRIFTGRID_MODE is 'local' (default).
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root?: string) {
    this.root = root ?? path.join(process.cwd(), 'projects');
  }

  private resolve(relativePath: string): string {
    const full = path.join(this.root, relativePath);
    const resolved = path.resolve(full);
    // Security: ensure path doesn't escape the root
    if (!resolved.startsWith(path.resolve(this.root))) {
      throw new Error(`Path escape attempt: ${relativePath}`);
    }
    return resolved;
  }

  async readFile(relativePath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(relativePath));
  }

  async readTextFile(relativePath: string): Promise<string> {
    return fs.readFile(this.resolve(relativePath), 'utf-8');
  }

  async writeFile(relativePath: string, data: Buffer | Uint8Array): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
  }

  async writeTextFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolve(relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  async copyFile(srcRelative: string, destRelative: string): Promise<void> {
    const src = this.resolve(srcRelative);
    const dest = this.resolve(destRelative);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }

  async listDir(relativePath: string): Promise<string[]> {
    return fs.readdir(this.resolve(relativePath));
  }

  async mkdir(relativePath: string): Promise<void> {
    await fs.mkdir(this.resolve(relativePath), { recursive: true });
  }

  async stat(relativePath: string): Promise<FileStat | null> {
    try {
      const s = await fs.stat(this.resolve(relativePath));
      return {
        isDirectory: s.isDirectory(),
        mtimeMs: s.mtimeMs,
        size: s.size,
      };
    } catch {
      return null;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  resolvePath(relativePath: string): string | null {
    try {
      return this.resolve(relativePath);
    } catch {
      return null;
    }
  }

  validatePath(relativePath: string): string | null {
    try {
      this.resolve(relativePath);
      return relativePath;
    } catch {
      return null;
    }
  }
}
