/** Stand-in for @tauri-apps/api/event in `npm run dev:mock`. */
const handlers = new Set<() => void>();

export async function listen(_event: string, handler: () => void) {
  handlers.add(handler);
  return () => void handlers.delete(handler);
}

/** Simulates the core announcing new data. */
export const notify = () => handlers.forEach((h) => h());

setInterval(notify, 5000);
