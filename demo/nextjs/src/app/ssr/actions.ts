"use server";

/**
 * Server-side in-memory store for SSR mode.
 * These server actions implement host:requires (persist:load, persist:save).
 */
let stored = 0;

export async function persistLoadAction() {
  return { value: stored };
}

export async function persistSaveAction(params: Record<string, unknown>) {
  if (typeof params.value === "number") {
    stored = params.value;
  }
  return { value: stored };
}
