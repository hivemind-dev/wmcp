/**
 * Kanban Board — Host-side integration
 *
 * Run: npx tsx examples/kanban-board/host-app.ts
 */

import { WmcpHost } from '../../src/core/host.js';
import { KanbanModule, type Board } from './kanban-module.js';

async function main() {
  console.log('=== wMCP Kanban Board Example ===\n');

  const kanban = new KanbanModule();
  const host = new WmcpHost(kanban.wmcpClient);

  let nextCardId = 1;
  const columns = new Map<
    string,
    { id: string; name: string; cards: Array<{ id: string; title: string; description?: string; assignee?: string; columnId: string }> }
  >();
  columns.set('col-todo', { id: 'col-todo', name: 'To Do', cards: [] });
  columns.set('col-progress', { id: 'col-progress', name: 'In Progress', cards: [] });
  columns.set('col-done', { id: 'col-done', name: 'Done', cards: [] });

  function snapshotBoard(): Board {
    return {
      id: 'board-1',
      name: 'Sprint Board',
      columns: Array.from(columns.values()).map((c) => ({
        id: c.id,
        name: c.name,
        cards: c.cards.map((card) => ({ ...card })),
      })),
    };
  }

  let allowMoveToDone = false;

  host.override('kanban:moveCard', async (params, superFn) => {
    const target = params.targetColumnId as string;
    if (target === 'col-done' && !allowMoveToDone) {
      throw new Error('Host policy: cannot move to Done until permitted');
    }
    return superFn(params);
  });

  host.connectDirect({
    'board:load': async (params) => {
      const boardId = params.boardId as string;
      return { ...snapshotBoard(), id: boardId };
    },
    'card:create': async (params) => {
      const id = `card-${nextCardId++}`;
      const card = {
        id,
        title: params.title as string,
        description: params.description as string | undefined,
        assignee: params.assignee as string | undefined,
        columnId: params.columnId as string,
      };
      const col = columns.get(params.columnId as string);
      col?.cards.push(card);
      return card;
    },
    'card:update': async (params) => {
      for (const col of columns.values()) {
        const card = col.cards.find((c) => c.id === params.cardId);
        if (card) {
          if (params.title !== undefined) card.title = params.title as string;
          if (params.description !== undefined) {
            card.description = params.description as string | undefined;
          }
          if (params.assignee !== undefined) {
            card.assignee = params.assignee as string | undefined;
          }
          return { ...card };
        }
      }
      throw new Error(`Card not found: ${params.cardId}`);
    },
    'card:move': async (params) => {
      const cardId = params.cardId as string;
      const targetCol = columns.get(params.targetColumnId as string);
      if (!targetCol) throw new Error(`Column not found: ${params.targetColumnId}`);
      for (const col of columns.values()) {
        const idx = col.cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          const [card] = col.cards.splice(idx, 1);
          card.columnId = targetCol.id;
          const pos = (params.position as number) ?? targetCol.cards.length;
          targetCol.cards.splice(pos, 0, card);
          return;
        }
      }
      throw new Error(`Card not found: ${cardId}`);
    },
    'card:delete': async (params) => {
      for (const col of columns.values()) {
        const idx = col.cards.findIndex((c) => c.id === (params.cardId as string));
        if (idx !== -1) {
          col.cards.splice(idx, 1);
          return;
        }
      }
    },
    'board:watch': async function* (params) {
      yield {
        type: 'snapshot',
        boardId: params.boardId as string,
        data: snapshotBoard(),
        userId: 'mock',
        timestamp: Date.now(),
      };
    },
  });

  host.on('board:changed', (data) => {
    console.log('[Host] board:changed:', data);
  });

  await kanban.mount({
    config: {
      columns: ['To Do', 'In Progress', 'Done'],
      swimlanes: false,
      assignees: ['Alice', 'Bob'],
    },
  });

  await kanban.loadBoard('board-1');

  const card1 = await kanban.createCard('col-todo', 'Implement wMCP runtime', 'Core protocol', 'Alice');
  await kanban.createCard('col-todo', 'Write documentation', undefined, 'Bob');

  const fromHost = await host.call<Board>('kanban:getBoard');
  console.log('[Host] kanban:getBoard columns:', fromHost.columns.map((c) => c.name).join(', '));

  await kanban.moveCard(card1.id, 'col-todo', 'col-progress');

  try {
    await host.call('kanban:moveCard', {
      cardId: card1.id,
      fromColumnId: 'col-progress',
      targetColumnId: 'col-done',
    });
  } catch (e) {
    console.log('[Host] Expected override block:', (e as Error).message);
  }

  allowMoveToDone = true;
  await host.call('kanban:moveCard', {
    cardId: card1.id,
    fromColumnId: 'col-progress',
    targetColumnId: 'col-done',
  });
  console.log('[Host] kanban:moveCard to Done after policy allow');

  const grabbed = await host.call<{ id: string }>('kanban:getCard', { cardId: card1.id });
  console.log('[Host] kanban:getCard title lookup id:', grabbed.id);

  host.emit('board:externalUpdate', { board: snapshotBoard() });

  console.log('\n[Host] Final board state:');
  for (const col of columns.values()) {
    console.log(`  ${col.name}: [${col.cards.map((c) => c.title).join(', ')}]`);
  }

  if (kanban.wmcpClient.has('board:watch')) {
    for await (const chunk of kanban.wmcpClient.stream<unknown>('board:watch', {
      boardId: 'board-1',
    })) {
      console.log('[Kanban] board:watch chunk:', chunk);
      break;
    }
  }

  console.log('\n=== Done ===');
  host.destroy();
}

main().catch(console.error);
