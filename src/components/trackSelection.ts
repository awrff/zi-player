import type { MenuProps } from "antd";
import type { VideoItem } from "@/types";
import type { SelectModifiers } from "@/lib/selection";

export interface TrackSelectionView {
  selecting: boolean;
  selectedIds: Set<string>;
  batchMenu?: MenuProps;
  onSelectClick: (item: VideoItem, mods: SelectModifiers) => "select" | "activate";
  onSelectToggle: (item: VideoItem) => void;
}
