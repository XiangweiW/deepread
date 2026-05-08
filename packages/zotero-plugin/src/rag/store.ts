import type { IndexRecord } from '@deepread/shared';

const SUBDIR = 'zotero-copilot';

function debug(msg: string, err?: unknown): void {
  try {
    const detail = err instanceof Error ? err.message : err != null ? String(err) : '';
    Zotero.debug(`[zotero-copilot:rag/store] ${msg}${detail ? ' :: ' + detail : ''}`, 1);
  } catch {
  }
}

function getDataDir(): string {
  try {
    if (typeof Zotero?.DataDirectory?.dir === 'string') return Zotero.DataDirectory.dir;
    if (typeof Zotero?.DataDirectory?.dir === 'function') return Zotero.DataDirectory.dir();
    if (typeof Zotero?.getZoteroDirectory === 'function') {
      const d = Zotero.getZoteroDirectory();
      if (d && typeof d.path === 'string') return d.path;
    }
  } catch (err) {
    debug('getDataDir lookup failed', err);
  }
  return '';
}

function joinPath(...parts: string[]): string {
  try {
    const PathUtils: any = (globalThis as any).PathUtils;
    if (PathUtils && typeof PathUtils.join === 'function') {
      return PathUtils.join(...parts);
    }
  } catch {
  }
  const sep = parts[0] && parts[0].includes('\\') && !parts[0].includes('/') ? '\\' : '/';
  return parts
    .filter((p) => p && p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(new RegExp(`${sep === '/' ? '/' : '\\\\'}+$`), '') : p.replace(/^[\\/]+/, '').replace(/[\\/]+$/, '')))
    .join(sep);
}

async function ensureDir(dir: string): Promise<void> {
  try {
    const IOUtils: any = (globalThis as any).IOUtils;
    if (IOUtils && typeof IOUtils.makeDirectory === 'function') {
      await IOUtils.makeDirectory(dir, { ignoreExisting: true, createAncestors: true });
      return;
    }
  } catch (err) {
    debug('IOUtils.makeDirectory failed', err);
  }
  try {
    if (Zotero?.File?.createDirectoryIfMissingAsync) {
      await Zotero.File.createDirectoryIfMissingAsync(dir);
    } else if (Zotero?.File?.createDirectoryIfMissing) {
      Zotero.File.createDirectoryIfMissing(dir);
    }
  } catch (err) {
    debug('Zotero.File.createDirectoryIfMissing failed', err);
  }
}

function getIndexPath(collectionID: number): string {
  const dataDir = getDataDir();
  if (!dataDir) throw new Error('Zotero data directory unavailable');
  return joinPath(dataDir, SUBDIR, `index-collection-${collectionID}.json`);
}

function getIndexDir(): string {
  const dataDir = getDataDir();
  if (!dataDir) throw new Error('Zotero data directory unavailable');
  return joinPath(dataDir, SUBDIR);
}

export async function loadIndex(collectionID: number): Promise<IndexRecord | null> {
  let path: string;
  try {
    path = getIndexPath(collectionID);
  } catch (err) {
    debug('getIndexPath failed', err);
    return null;
  }
  try {
    let exists = false;
    try {
      const IOUtils: any = (globalThis as any).IOUtils;
      if (IOUtils && typeof IOUtils.exists === 'function') {
        exists = await IOUtils.exists(path);
      } else if (Zotero?.File?.pathToFile) {
        const f = Zotero.File.pathToFile(path);
        exists = !!(f && f.exists && f.exists());
      }
    } catch (err) {
      debug('exists check failed', err);
    }
    if (!exists) return null;

    const raw = await Zotero.File.getContentsAsync(path);
    if (!raw) return null;
    const text = typeof raw === 'string' ? raw : String(raw);
    const parsed = JSON.parse(text) as IndexRecord;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.chunks)) return null;
    return parsed;
  } catch (err) {
    debug(`loadIndex(${collectionID}) failed`, err);
    return null;
  }
}

export async function saveIndex(record: IndexRecord): Promise<void> {
  const dir = getIndexDir();
  await ensureDir(dir);
  const path = getIndexPath(record.collectionID);
  const json = JSON.stringify(record);
  try {
    await Zotero.File.putContentsAsync(path, json);
  } catch (err) {
    debug(`saveIndex(${record.collectionID}) failed`, err);
    throw err;
  }
}

export async function deleteIndex(collectionID: number): Promise<void> {
  try {
    const path = getIndexPath(collectionID);
    const IOUtils: any = (globalThis as any).IOUtils;
    if (IOUtils && typeof IOUtils.remove === 'function') {
      await IOUtils.remove(path, { ignoreAbsent: true });
      return;
    }
    if (Zotero?.File?.pathToFile) {
      const f = Zotero.File.pathToFile(path);
      if (f && f.exists && f.exists()) f.remove(false);
    }
  } catch (err) {
    debug(`deleteIndex(${collectionID}) failed`, err);
  }
}
