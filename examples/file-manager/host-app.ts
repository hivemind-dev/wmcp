/**
 * File Manager — Host-side integration
 *
 * Binds fs:* host:requires with an in-memory mock filesystem, calls fm:* via host.call,
 * listens to module:events, emits fs:externalChange to the module.
 *
 * Run: npx tsx examples/file-manager/host-app.ts
 */

import { WmcpHost } from '../../src/core/host.js';
import { FileManagerModule } from './file-manager-module.js';
import type { FileEntry } from './file-manager-module.js';

interface MockFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  content: string;
  modifiedAt: string;
}

function isDirectChild(dirPath: string, path: string): boolean {
  if (path === dirPath) return false;
  if (dirPath === '/') return /^\/[^/]+$/.test(path);
  const prefix = `${dirPath.replace(/\/$/, '')}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes('/');
}

function directChildren(files: Map<string, MockFile>, dirPath: string): FileEntry[] {
  const out: FileEntry[] = [];
  for (const f of files.values()) {
    if (!isDirectChild(dirPath, f.path)) continue;
    out.push({
      name: f.name,
      path: f.path,
      type: f.type,
      size: f.size,
      modifiedAt: f.modifiedAt,
    });
  }
  return out;
}

function listRecursive(files: Map<string, MockFile>, dirPath: string): FileEntry[] {
  const base = dirPath === '/' ? '/' : `${dirPath.replace(/\/$/, '')}/`;
  const out: FileEntry[] = [];
  for (const f of files.values()) {
    if (f.path === dirPath) continue;
    const under =
      dirPath === '/'
        ? f.path.startsWith('/') && f.path.length > 1
        : f.path.startsWith(base);
    if (!under) continue;
    out.push({
      name: f.name,
      path: f.path,
      type: f.type,
      size: f.size,
      modifiedAt: f.modifiedAt,
    });
  }
  return out;
}

async function main() {
  console.log('=== wMCP File Manager Example ===\n');

  const fm = new FileManagerModule();
  const host = new WmcpHost(fm.wmcpClient);

  const files = new Map<string, MockFile>();
  const now = () => new Date().toISOString();
  files.set('/docs', { name: 'docs', path: '/docs', type: 'directory', size: 0, content: '', modifiedAt: now() });
  files.set('/docs/readme.md', {
    name: 'readme.md',
    path: '/docs/readme.md',
    type: 'file',
    size: 12,
    content: '# Hello wMCP',
    modifiedAt: now(),
  });
  files.set('/docs/spec.md', {
    name: 'spec.md',
    path: '/docs/spec.md',
    type: 'file',
    size: 20,
    content: '# wMCP Specification',
    modifiedAt: now(),
  });
  files.set('/src', { name: 'src', path: '/src', type: 'directory', size: 0, content: '', modifiedAt: now() });
  files.set('/src/index.ts', {
    name: 'index.ts',
    path: '/src/index.ts',
    type: 'file',
    size: 11,
    content: 'export {}',
    modifiedAt: now(),
  });

  host.connectDirect({
    'fs:list': async (params) => {
      const dirPath = params.path as string;
      const recursive = Boolean(params.recursive);
      if (recursive) return listRecursive(files, dirPath);
      return directChildren(files, dirPath);
    },
    'fs:read': async (params) => {
      const f = files.get(params.path as string);
      if (!f || f.type !== 'file') throw new Error(`File not found: ${params.path}`);
      return { path: f.path, content: f.content, encoding: 'utf-8', size: f.size };
    },
    'fs:write': async (params) => {
      const path = params.path as string;
      const content = params.content as string;
      const name = path.split('/').pop() ?? '';
      const ts = now();
      files.set(path, { name, path, type: 'file', size: content.length, content, modifiedAt: ts });
      return { path, size: content.length, modifiedAt: ts };
    },
    'fs:delete': async (params) => {
      const path = params.path as string;
      const recursive = Boolean(params.recursive);
      if (recursive) {
        for (const p of [...files.keys()]) {
          if (p === path || p.startsWith(path === '/' ? '/' : `${path}/`)) files.delete(p);
        }
      } else {
        files.delete(path);
      }
    },
    'fs:move': async (params) => {
      const from = params.from as string;
      const to = params.to as string;
      const f = files.get(from);
      if (!f) throw new Error(`Not found: ${from}`);
      files.delete(from);
      f.path = to;
      f.name = to.split('/').pop() ?? '';
      f.modifiedAt = now();
      files.set(to, f);
      return { from, to, modifiedAt: f.modifiedAt };
    },
    'fs:upload': async (params) => {
      const path = params.path as string;
      const data = params.data as Blob;
      const content = await data.text();
      const name = path.split('/').pop() ?? '';
      const ts = now();
      files.set(path, { name, path, type: 'file', size: content.length, content, modifiedAt: ts });
      return { path, size: content.length, modifiedAt: ts };
    },
    'fs:download': async (params) => {
      const f = files.get(params.path as string);
      if (!f || f.type !== 'file') throw new Error(`File not found: ${params.path}`);
      return new Blob([f.content], { type: 'application/octet-stream' });
    },
  });

  host.on('fs:selected', (data) => console.log('[Host] fs:selected:', data));
  host.on('fs:renamed', (data) => console.log('[Host] fs:renamed:', data));
  host.on('fs:deleted', (data) => console.log('[Host] fs:deleted:', data));
  host.on('wmcp:ready', () => console.log('[Host] Module is ready'));

  await fm.mount({ config: { rootPath: '/', viewMode: 'tree', showHidden: false } });

  console.log(`[Host] Upload supported: ${fm.canUpload()}`);
  console.log(`[Host] Download supported: ${fm.canDownload()}`);

  await host.call('fm:navigate', { path: '/docs' });
  console.log('[Host] fm:navigate /docs ->', await host.call('fm:getSelectedPath', {}));

  host.emit('fs:externalChange', { reason: 'mock sync', paths: ['/docs'] });

  const rootEntries = await fm.listDirectory('/');
  console.log('[Host] Root entries:', rootEntries.map((e) => e.name));

  const docEntries = await fm.listDirectory('/docs');
  console.log('[Host] /docs entries:', docEntries.map((e) => e.name));

  fm.selectEntry('/docs/readme.md', 'file');

  const content = await fm.readFile('/docs/readme.md');
  console.log(`[Host] File content: "${content.content}"`);

  await fm.writeFile('/docs/new-file.md', '# New File\nCreated via wMCP');

  await fm.moveFile('/docs/new-file.md', '/docs/renamed-file.md');

  await fm.deleteFile('/docs/renamed-file.md');

  await host.call('fm:setViewMode', { viewMode: 'list' });
  console.log('[Host] After fm:setViewMode:', (await host.call('fm:getSelectedPath', {})) as { viewMode: string });

  console.log('\n=== Done ===');
  host.destroy();
}

main().catch(console.error);
