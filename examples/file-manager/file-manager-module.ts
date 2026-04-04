/**
 * @aurorah/wmcp-file-manager — Sub-module example
 *
 * Owns navigation, selection, and viewMode. Registers fm:* capabilities,
 * calls host fs:* via wmcpClient.call, emits fs:selected / fs:renamed / fs:deleted,
 * listens for fs:externalChange from the host.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
}

export interface FileManagerState {
  rootPath: string;
  showHidden: boolean;
  viewMode: 'tree' | 'grid' | 'list';
  currentPath: string;
  selectedPath: string | null;
  selectedType: 'file' | 'directory' | null;
}

export class FileManagerModule {
  public readonly wmcpClient: WmcpClient;
  private rootPath = '/';
  private showHidden = false;
  private viewMode: 'tree' | 'grid' | 'list' = 'tree';
  private currentPath = '/';
  private selectedPath: string | null = null;
  private selectedType: 'file' | 'directory' | null = null;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);

    this.wmcpClient._registerCapabilities({
      'fm:getSelectedPath': async () => this.getStateSnapshot(),

      'fm:navigate': async (params) => {
        const path = params.path as string;
        this.currentPath = this.normalizeDirPath(path);
        this.selectedPath = this.currentPath;
        this.selectedType = 'directory';
        this.wmcpClient.emit('fs:selected', {
          path: this.selectedPath,
          type: this.selectedType,
        });
        return {
          currentPath: this.currentPath,
          selectedPath: this.selectedPath,
          selectedType: this.selectedType,
        };
      },

      'fm:setViewMode': async (params) => {
        const mode = params.viewMode as 'tree' | 'grid' | 'list';
        this.viewMode = mode;
        return { viewMode: this.viewMode };
      },
    });

    this.wmcpClient.on('fs:externalChange', (data) => {
      const payload = data as { reason?: string; paths?: string[] };
      console.log(
        `[FileManagerModule] fs:externalChange: ${payload.reason ?? '(no reason)'} paths=${JSON.stringify(payload.paths ?? [])}`,
      );
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    const config = options?.config ?? {};
    this.rootPath = (config.rootPath as string) ?? '/';
    this.showHidden = (config.showHidden as boolean) ?? false;
    const vm = (config.viewMode as string) ?? 'tree';
    this.viewMode = vm === 'grid' || vm === 'list' ? vm : 'tree';
    this.currentPath = this.normalizeDirPath(this.rootPath);
    this.selectedPath = this.currentPath;
    this.selectedType = 'directory';
    console.log(
      `[FileManagerModule] Mounted root=${this.rootPath} current=${this.currentPath} view=${this.viewMode} showHidden=${this.showHidden}`,
    );
  }

  getState(): FileManagerState {
    return this.getStateSnapshot();
  }

  private getStateSnapshot(): FileManagerState {
    return {
      rootPath: this.rootPath,
      showHidden: this.showHidden,
      viewMode: this.viewMode,
      currentPath: this.currentPath,
      selectedPath: this.selectedPath,
      selectedType: this.selectedType,
    };
  }

  private normalizeDirPath(path: string): string {
    let p = path.replace(/\/+/g, '/');
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  private filterHidden(entries: FileEntry[]): FileEntry[] {
    if (this.showHidden) return entries;
    return entries.filter((e) => !e.name.startsWith('.'));
  }

  async listDirectory(path?: string, recursive = false): Promise<FileEntry[]> {
    const dir = path !== undefined ? this.normalizeDirPath(path) : this.currentPath;
    const entries = await this.wmcpClient.call<FileEntry[]>('fs:list', { path: dir, recursive });
    return this.filterHidden(entries);
  }

  async readFile(path: string): Promise<FileContent> {
    return this.wmcpClient.call<FileContent>('fs:read', { path });
  }

  async writeFile(path: string, content: string, createDirs = false): Promise<void> {
    await this.wmcpClient.call('fs:write', { path, content, createDirs });
    console.log(`[FileManagerModule] Written: ${path}`);
  }

  async deleteFile(path: string, recursive = false): Promise<void> {
    await this.wmcpClient.call('fs:delete', { path, recursive });
    this.wmcpClient.emit('fs:deleted', { path });
    if (this.selectedPath === path) {
      this.selectedPath = null;
      this.selectedType = null;
    }
    console.log(`[FileManagerModule] Deleted: ${path}`);
  }

  async moveFile(from: string, to: string): Promise<void> {
    await this.wmcpClient.call('fs:move', { from, to });
    this.wmcpClient.emit('fs:renamed', { from, to });
    if (this.selectedPath === from) {
      this.selectedPath = to;
      this.selectedType = this.selectedType;
    }
    console.log(`[FileManagerModule] Moved: ${from} -> ${to}`);
  }

  async uploadFile(path: string, data: Blob): Promise<void> {
    if (!this.wmcpClient.has('fs:upload')) {
      throw new Error('fs:upload is not bound');
    }
    await this.wmcpClient.call('fs:upload', { path, data });
    console.log(`[FileManagerModule] Uploaded: ${path}`);
  }

  async downloadFile(path: string): Promise<Blob> {
    if (!this.wmcpClient.has('fs:download')) {
      throw new Error('fs:download is not bound');
    }
    return this.wmcpClient.call<Blob>('fs:download', { path });
  }

  selectEntry(path: string, type: 'file' | 'directory'): void {
    this.selectedPath = path;
    this.selectedType = type;
    this.wmcpClient.emit('fs:selected', { path, type });
  }

  canUpload(): boolean {
    return this.wmcpClient.has('fs:upload');
  }

  canDownload(): boolean {
    return this.wmcpClient.has('fs:download');
  }
}

export { manifest };
