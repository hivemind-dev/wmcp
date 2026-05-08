/**
 * @aurorah/wmcp-rich-editor — Sub-module example
 *
 * The module owns editing state, registers editor:* capabilities, calls
 * host doc:* for persistence, emits doc:* and selection:* events, and
 * listens for theme:changed from the host.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export interface EditorDocument {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

export class RichEditorModule {
  public readonly wmcpClient: WmcpClient;
  private currentDoc: EditorDocument | null = null;
  private dirty = false;
  private theme = 'light';
  private locale = 'en';
  private toolbar: unknown[] = [];
  private readOnly = false;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);
    this.wmcpClient._requireReadiness();

    this.wmcpClient._registerCapabilities({
      'editor:getContent': async () => ({
        content: this.currentDoc?.content ?? '',
        docId: this.currentDoc?.id ?? null,
        title: this.currentDoc?.title ?? null,
        dirty: this.dirty,
        readOnly: this.readOnly,
      }),

      'editor:setContent': async (params) => {
        if (this.readOnly) {
          throw new Error('Editor is read-only');
        }
        const content = params.content as string;
        if (!this.currentDoc) {
          throw new Error('No document loaded');
        }
        this.currentDoc.content = content;
        this.dirty = true;
        this.wmcpClient.emit('doc:modified', {
          docId: this.currentDoc.id,
          dirty: true,
        });
        const len = content.length;
        this.wmcpClient.emit('selection:changed', {
          start: len,
          end: len,
          text: '',
        });
        return { ok: true };
      },

      'editor:format': async (params) => {
        if (this.readOnly) {
          throw new Error('Editor is read-only');
        }
        if (!this.currentDoc) {
          throw new Error('No document loaded');
        }
        const kind = params.kind as string;
        let c = this.currentDoc.content;
        switch (kind) {
          case 'bold':
            c = c.startsWith('**') && c.endsWith('**') ? c.slice(2, -2) : `**${c}**`;
            break;
          case 'italic':
            c = c.startsWith('_') && c.endsWith('_') ? c.slice(1, -1) : `_${c}_`;
            break;
          case 'heading':
            c = c.startsWith('# ') ? c.slice(2) : `# ${c}`;
            break;
          default:
            throw new Error(`Unknown format kind: ${kind}`);
        }
        this.currentDoc.content = c;
        this.dirty = true;
        this.wmcpClient.emit('doc:modified', {
          docId: this.currentDoc.id,
          dirty: true,
        });
        this.wmcpClient.emit('selection:changed', {
          start: c.length,
          end: c.length,
          text: '',
        });
        return { content: c };
      },
    });

    this.wmcpClient.on('theme:changed', (data) => {
      const rec = data as Record<string, unknown>;
      const next = rec.theme as string | undefined;
      if (next) {
        this.theme = next;
        console.log(`[RichEditor] theme:changed -> ${this.theme}`);
      }
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    const config = options?.config ?? {};
    this.theme = (config.theme as string) ?? 'light';
    this.locale = (config.locale as string) ?? 'en';
    this.toolbar = (config.toolbar as unknown[]) ?? [];
    this.readOnly = Boolean(config.readOnly);
    console.log(
      `[RichEditor] Mounted theme="${this.theme}" locale="${this.locale}" readOnly=${this.readOnly} toolbar=${JSON.stringify(this.toolbar)}`,
    );

    this.wmcpClient._setReady();
  }

  async loadDocument(docId: string): Promise<EditorDocument> {
    const doc = await this.wmcpClient.call<EditorDocument>('doc:load', { docId });
    this.currentDoc = { ...doc };
    this.dirty = false;
    console.log(`[RichEditor] Loaded: "${doc.title}"`);
    return this.currentDoc;
  }

  async saveDocument(): Promise<void> {
    if (!this.currentDoc) {
      throw new Error('No document loaded');
    }
    const result = await this.wmcpClient.call<{ id: string; updatedAt: string }>('doc:save', {
      docId: this.currentDoc.id,
      title: this.currentDoc.title,
      content: this.currentDoc.content,
    });
    this.currentDoc.updatedAt = result.updatedAt;
    this.dirty = false;
    this.wmcpClient.emit('doc:saved', { docId: result.id, version: 1 });
    console.log(`[RichEditor] Saved: ${result.id} at ${result.updatedAt}`);
  }

  async listDocuments(page = 1, limit = 20): Promise<EditorDocument[]> {
    return this.wmcpClient.call<EditorDocument[]>('doc:list', { page, limit });
  }

  async exportDocument(format: 'pdf' | 'html' | 'markdown'): Promise<Blob | string | null> {
    if (!this.currentDoc) {
      throw new Error('No document loaded');
    }
    if (!this.wmcpClient.has('doc:export')) {
      console.log('[RichEditor] doc:export not bound');
      return null;
    }
    return this.wmcpClient.call<Blob>('doc:export', {
      docId: this.currentDoc.id,
      format,
    });
  }

  getSnapshot(): { doc: EditorDocument | null; dirty: boolean } {
    return {
      doc: this.currentDoc ? { ...this.currentDoc } : null,
      dirty: this.dirty,
    };
  }
}

export { manifest };
