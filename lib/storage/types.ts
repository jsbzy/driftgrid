/**
 * StorageAdapter — abstracts filesystem operations for DriftGrid.
 *
 * All paths are relative to the projects root directory.
 * In local mode: projects root = process.cwd()/projects
 * In cloud mode: projects root = R2 bucket prefix / database scope
 */

export interface FileStat {
  isDirectory: boolean;
  mtimeMs: number;
  size: number;
}

export interface StorageAdapter {
  // --- File I/O ---

  /** Read a file as Buffer (binary). Throws if not found. */
  readFile(relativePath: string): Promise<Buffer>;

  /** Read a file as UTF-8 string. Throws if not found. */
  readTextFile(relativePath: string): Promise<string>;

  /** Write binary data to a file. Creates parent directories as needed. */
  writeFile(relativePath: string, data: Buffer | Uint8Array): Promise<void>;

  /** Write a UTF-8 string to a file. Creates parent directories as needed. */
  writeTextFile(relativePath: string, content: string): Promise<void>;

  /** Copy a file. Creates parent directories for dest as needed. */
  copyFile(srcRelative: string, destRelative: string): Promise<void>;

  // --- Directory operations ---

  /** List entries in a directory (filenames only, not full paths). */
  listDir(relativePath: string): Promise<string[]>;

  /** Create a directory (recursive). No-op if already exists. */
  mkdir(relativePath: string): Promise<void>;

  /** Get file/directory stats. Returns null if path doesn't exist. */
  stat(relativePath: string): Promise<FileStat | null>;

  /** Check if a path exists. */
  exists(relativePath: string): Promise<boolean>;

  // --- Path resolution ---

  /**
   * Resolve a relative path to an absolute filesystem path.
   * Only meaningful in local mode — returns the absolute path.
   * In cloud mode, returns null (files don't live on the local filesystem).
   */
  resolvePath(relativePath: string): string | null;

  /**
   * Validate that a relative path doesn't escape the projects root.
   * Returns the sanitized relative path, or null if the path is invalid.
   */
  validatePath(relativePath: string): string | null;
}
