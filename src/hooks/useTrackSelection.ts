import { useCallback, useMemo, useRef, useState } from "react";
import {
  isMultiModifier,
  pruneIds,
  rangeIds,
  toggleId,
  unionIds,
  type SelectModifiers,
} from "@/lib/selection";

export type { SelectModifiers };

export function useTrackSelection(visibleIds: string[]) {
  const [managing, setManaging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const anchorIdRef = useRef<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedIds = useMemo(
    () => visibleIds.filter((id) => selectedSet.has(id)),
    [visibleIds, selectedSet],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const enter = useCallback(() => setManaging(true), []);

  const exit = useCallback(() => {
    setManaging(false);
    setSelectedIds([]);
    anchorIdRef.current = null;
  }, []);

  const prune = useCallback((existingIds: Iterable<string>) => {
    setSelectedIds((prev) => {
      const next = pruneIds(prev, existingIds);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setManaging(true);
    setSelectedIds((prev) => toggleId(prev, id));
    anchorIdRef.current = id;
  }, []);

  const selectRange = useCallback((id: string, ids: string[]) => {
    setManaging(true);
    const range = rangeIds(ids, anchorIdRef.current, id);
    setSelectedIds((prev) => unionIds(prev, range));
    if (!anchorIdRef.current) anchorIdRef.current = id;
  }, []);

  const onItemClick = useCallback(
    (id: string, mods: SelectModifiers): "select" | "activate" => {
      if (mods.shift) {
        selectRange(id, visibleIds);
        return "select";
      }
      if (managing || isMultiModifier(mods)) {
        toggle(id);
        return "select";
      }
      return "activate";
    },
    [managing, selectRange, toggle, visibleIds],
  );

  const selectAllVisible = useCallback(() => {
    if (visibleIds.length === 0) return;
    setManaging(true);
    setSelectedIds((prev) => unionIds(prev, visibleIds));
  }, [visibleIds]);

  const clearVisible = useCallback(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((prev) => prev.filter((id) => !visible.has(id)));
  }, [visibleIds]);

  return {
    managing,
    selectedIds,
    selectedSet,
    visibleSelectedIds,
    allVisibleSelected,
    enter,
    exit,
    prune,
    toggle,
    selectRange,
    onItemClick,
    selectAllVisible,
    clearVisible,
  };
}
