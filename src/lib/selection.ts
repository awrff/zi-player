export interface SelectModifiers {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export function isMultiModifier(mods: SelectModifiers): boolean {
  return Boolean(mods.ctrl || mods.meta);
}

export function selectModifiers(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectModifiers {
  return { ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey };
}

export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
}

export function pruneIds(selected: string[], existing: Iterable<string>): string[] {
  const keep = new Set(existing);
  return selected.filter((id) => keep.has(id));
}

export function rangeIds(ids: string[], fromId: string | null, toId: string): string[] {
  const to = ids.indexOf(toId);
  if (to < 0) return [];
  const from = fromId ? ids.indexOf(fromId) : -1;
  if (from < 0) return [toId];
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  return ids.slice(start, end + 1);
}

export function unionIds(selected: string[], extra: string[]): string[] {
  const next = new Set(selected);
  for (const id of extra) next.add(id);
  return [...next];
}
