import type { RepeatMode } from "@/types";

export const PREV_RESTART_SECONDS = 3;

export function shuffledOrder(
  ids: string[],
  currentId: string | null,
  random: () => number = Math.random,
): string[] {
  const rest = ids.filter((id) => id !== currentId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = rest[i];
    rest[i] = rest[j]!;
    rest[j] = swap!;
  }
  return currentId && ids.includes(currentId) ? [currentId, ...rest] : rest;
}

export function playOrder(queueIds: string[], shuffleOrder: string[] | null): string[] {
  return shuffleOrder ?? queueIds;
}

export function nextId(order: string[], currentId: string | null, repeat: RepeatMode): string | null {
  if (order.length === 0) return null;
  if (repeat === "one" && currentId && order.includes(currentId)) return currentId;
  const index = currentId ? order.indexOf(currentId) : -1;
  if (index < 0) return order[0] ?? null;
  if (index + 1 < order.length) return order[index + 1] ?? null;
  return repeat === "all" ? (order[0] ?? null) : null;
}

export function prevId(order: string[], currentId: string | null, repeat: RepeatMode): string | null {
  if (order.length === 0) return null;
  const index = currentId ? order.indexOf(currentId) : -1;
  if (index < 0) return order[0] ?? null;
  if (index > 0) return order[index - 1] ?? null;
  return repeat === "all" ? (order[order.length - 1] ?? null) : currentId;
}

export function shouldRestartOnPrev(currentTime: number): boolean {
  return currentTime > PREV_RESTART_SECONDS;
}

export function nextRepeatMode(current: RepeatMode): RepeatMode {
  if (current === "off") return "all";
  if (current === "all") return "one";
  return "off";
}

export function repeatLabel(mode: RepeatMode): string {
  if (mode === "all") return "列表循环";
  if (mode === "one") return "单曲循环";
  return "关闭循环";
}

export function skipRepeat(repeat: RepeatMode): RepeatMode {
  return repeat === "one" ? "off" : repeat;
}
