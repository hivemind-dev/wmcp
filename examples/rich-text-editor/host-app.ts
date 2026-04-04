/**
 * Rich Text Editor — Host-side integration
 *
 * Run: npx tsx examples/rich-text-editor/host-app.ts
 */

import { WmcpHost } from '../../src/core/host.js';
import { RichEditorModule } from './editor-module.js';

async function main() {
  console.log('=== wMCP Rich Text Editor Example ===\n');

  const editor = new RichEditorModule();
  const host = new WmcpHost(editor.wmcpClient);

  const docs = new Map<string, { id: string; title: string; content: string; updatedAt: string }>();
  docs.set('doc-1', {
    id: 'doc-1',
    title: 'Getting Started with wMCP',
    content: '# wMCP\nA protocol for web modules.',
    updatedAt: new Date().toISOString(),
  });
  docs.set('doc-2', {
    id: 'doc-2',
    title: 'Architecture Overview',
    content: '# Architecture\nHost, module, capabilities.',
    updatedAt: new Date().toISOString(),
  });

  host.override('editor:setContent', async (params, superFn) => {
    let content = String(params.content ?? '');
    content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    console.log('[Host] editor:setContent override (scripts stripped), delegating to module');
    return superFn({ ...params, content });
  });

  host.connectDirect({
    'doc:load': async (params) => {
      const doc = docs.get(params.docId as string);
      if (!doc) {
        throw new Error(`Document not found: ${params.docId}`);
      }
      return { ...doc };
    },
    'doc:save': async (params) => {
      const id = params.docId as string;
      const existing = docs.get(id);
      if (!existing) {
        throw new Error(`Document not found: ${id}`);
      }
      existing.content = params.content as string;
      if (params.title) {
        existing.title = params.title as string;
      }
      existing.updatedAt = new Date().toISOString();
      return { id, updatedAt: existing.updatedAt };
    },
    'doc:list': async (params) => {
      const all = Array.from(docs.values());
      const page = (params.page as number) ?? 1;
      const limit = (params.limit as number) ?? 20;
      return all.slice((page - 1) * limit, page * limit);
    },
    'doc:export': async (params) => {
      const id = params.docId as string;
      const doc = docs.get(id);
      if (!doc) {
        throw new Error(`Document not found: ${id}`);
      }
      const format = params.format as string;
      const text = `[${format}] ${doc.title}\n\n${doc.content}`;
      return new Blob([text], { type: 'text/plain' });
    },
  });

  host.on('doc:modified', (data) => {
    console.log('[Host] doc:modified:', data);
  });
  host.on('doc:saved', (data) => {
    console.log('[Host] doc:saved:', data);
  });
  host.on('selection:changed', (data) => {
    console.log('[Host] selection:changed:', data);
  });

  await editor.mount({
    config: {
      theme: 'dark',
      locale: 'en',
      toolbar: ['bold', 'italic', 'heading'],
      readOnly: false,
    },
  });

  const listed = await editor.listDocuments();
  console.log(`[Host] doc:list -> ${listed.length} documents`);

  await editor.loadDocument('doc-1');

  const fromHost = await host.call<{
    content: string;
    docId: string | null;
    dirty: boolean;
  }>('editor:getContent');
  console.log('[Host] editor:getContent ->', {
    docId: fromHost.docId,
    dirty: fromHost.dirty,
    preview: fromHost.content.slice(0, 40),
  });

  await host.call('editor:setContent', {
    content: 'Hello <script>alert(1)</script> world',
  });

  await host.call('editor:format', { kind: 'bold' });

  await editor.saveDocument();

  host.emit('theme:changed', { theme: 'sepia' });

  const exported = await editor.exportDocument('markdown');
  if (exported instanceof Blob) {
    console.log('[Host] doc:export blob size:', exported.size);
  }

  console.log('\n=== Done ===');
  host.destroy();
}

main().catch(console.error);
