/**
 * wMCP — Web Module Connection Protocol
 * SSE / stream parsing helpers
 */

/**
 * Parses an SSE (Server-Sent Events) response body into an async generator.
 * Each `data:` line is JSON-parsed and yielded.
 * Lines starting with `:` (comments) and empty lines are skipped.
 */
export async function* parseSSE(response: Response): AsyncGenerator<unknown> {
  const body = response.body;
  if (!body) {
    throw new Error('Response body is null — cannot parse SSE stream');
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;

          try {
            yield JSON.parse(payload);
          } catch {
            yield payload;
          }
        }
      }
    }

    if (buffer.trim().startsWith('data: ')) {
      const payload = buffer.trim().slice(6);
      if (payload !== '[DONE]') {
        try {
          yield JSON.parse(payload);
        } catch {
          yield payload;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Checks whether a value is an AsyncIterable.
 */
export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in (value as object)
  );
}
