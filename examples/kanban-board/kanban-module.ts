/**
 * @aurorah/wmcp-kanban-board — Kanban module
 *
 * Owns board UI state, registers kanban:* capabilities, calls host:requires
 * for persistence, emits module:events, listens for board:externalUpdate.
 */

import { WmcpClient } from '../../src/core/client.js';
import type { WmcpManifest, WmcpMountOptions } from '../../src/core/types.js';
import manifest from './manifest.json';

export interface Card {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  labels?: string[];
  columnId: string;
}

export interface Column {
  id: string;
  name: string;
  cards: Card[];
}

export interface Board {
  id: string;
  name: string;
  columns: Column[];
}

function cloneBoard(board: Board): Board {
  return structuredClone(board);
}

export class KanbanModule {
  public readonly wmcpClient: WmcpClient;
  private board: Board | null = null;

  constructor() {
    this.wmcpClient = new WmcpClient(manifest as unknown as WmcpManifest);
    this.wmcpClient._requireReadiness();

    this.wmcpClient._registerCapabilities({
      'kanban:getBoard': async () => {
        if (!this.board) {
          throw new Error('No board loaded');
        }
        return cloneBoard(this.board);
      },

      'kanban:getCard': async (params) => {
        const cardId = params.cardId as string;
        const card = this.findCard(cardId);
        if (!card) {
          throw new Error(`Card not found: ${cardId}`);
        }
        return { ...card };
      },

      'kanban:moveCard': async (params) => {
        await this.performMove({
          cardId: params.cardId as string,
          fromColumnId: params.fromColumnId as string | undefined,
          targetColumnId: params.targetColumnId as string,
          position: params.position as number | undefined,
        });
        return { success: true };
      },
    });

    this.wmcpClient.on('board:externalUpdate', (data) => {
      const payload = data as { board?: Board };
      if (payload.board) {
        this.board = cloneBoard(payload.board);
        this.wmcpClient.emit('board:changed', { action: 'external', cardId: '' });
      }
    });
  }

  async mount(options?: WmcpMountOptions): Promise<void> {
    const config = options?.config ?? {};
    console.log(`[Kanban] Mounted. columns=${JSON.stringify(config.columns)}`);
    console.log(
      `[Kanban] swimlanes=${config.swimlanes} assignees=${JSON.stringify(config.assignees)}`,
    );

    this.wmcpClient._setReady();
  }

  getBoard(): Board | null {
    return this.board ? cloneBoard(this.board) : null;
  }

  async loadBoard(boardId: string): Promise<Board> {
    this.board = await this.wmcpClient.call<Board>('board:load', { boardId });
    console.log(
      `[Kanban] Loaded board "${this.board.name}" (${this.board.columns.length} columns)`,
    );
    return cloneBoard(this.board);
  }

  async createCard(
    columnId: string,
    title: string,
    description?: string,
    assignee?: string,
  ): Promise<Card> {
    if (!this.board) throw new Error('No board loaded');
    const card = await this.wmcpClient.call<Card>('card:create', {
      boardId: this.board.id,
      columnId,
      title,
      description,
      assignee,
    });
    const col = this.board.columns.find((c) => c.id === columnId);
    if (col) col.cards.push({ ...card });
    this.wmcpClient.emit('board:changed', { action: 'create', cardId: card.id });
    console.log(`[Kanban] Created card "${title}" in ${columnId}`);
    return { ...card };
  }

  async moveCard(
    cardId: string,
    fromColumnId: string,
    toColumnId: string,
    position?: number,
  ): Promise<void> {
    await this.performMove({ cardId, fromColumnId, targetColumnId: toColumnId, position });
  }

  async deleteCard(cardId: string): Promise<void> {
    if (!this.board) throw new Error('No board loaded');
    await this.wmcpClient.call('card:delete', { cardId });
    for (const col of this.board.columns) {
      const idx = col.cards.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        col.cards.splice(idx, 1);
        break;
      }
    }
    this.wmcpClient.emit('board:changed', { action: 'delete', cardId });
    console.log(`[Kanban] Deleted card ${cardId}`);
  }

  private findCard(cardId: string): Card | undefined {
    if (!this.board) return undefined;
    for (const col of this.board.columns) {
      const c = col.cards.find((x) => x.id === cardId);
      if (c) return c;
    }
    return undefined;
  }

  private async performMove(args: {
    cardId: string;
    fromColumnId?: string;
    targetColumnId: string;
    position?: number;
  }): Promise<void> {
    if (!this.board) throw new Error('No board loaded');

    const fromColumnId =
      args.fromColumnId ?? this.locateColumnId(args.cardId) ?? '';

    this.wmcpClient.emit('card:dragged', {
      cardId: args.cardId,
      fromColumnId,
    });

    await this.wmcpClient.call('card:move', {
      cardId: args.cardId,
      targetColumnId: args.targetColumnId,
      position: args.position,
    });

    const targetCol = this.board.columns.find((c) => c.id === args.targetColumnId);
    if (!targetCol) throw new Error(`Column not found: ${args.targetColumnId}`);

    let card: Card | undefined;
    for (const col of this.board.columns) {
      const idx = col.cards.findIndex((c) => c.id === args.cardId);
      if (idx !== -1) {
        [card] = col.cards.splice(idx, 1);
        break;
      }
    }
    if (!card) throw new Error(`Card not found: ${args.cardId}`);

    card.columnId = targetCol.id;
    const pos = args.position ?? targetCol.cards.length;
    targetCol.cards.splice(pos, 0, card);

    this.wmcpClient.emit('card:dropped', {
      cardId: args.cardId,
      toColumnId: args.targetColumnId,
      position: pos,
    });
    this.wmcpClient.emit('board:changed', { action: 'move', cardId: args.cardId });
    console.log(`[Kanban] Moved ${args.cardId} -> ${args.targetColumnId}`);
  }

  private locateColumnId(cardId: string): string | undefined {
    if (!this.board) return undefined;
    for (const col of this.board.columns) {
      if (col.cards.some((c) => c.id === cardId)) return col.id;
    }
    return undefined;
  }
}

export { manifest };
