import { Check, CircleQuestionMark, Scissors, type LucideIcon } from "lucide-react";

import type { NodeStatus } from "../../domain/types";

/** How each status is shown: the node's corner badge, the menu, export. */
export const STATUS_META: Readonly<Record<NodeStatus, { readonly label: string; readonly icon: LucideIcon }>> = {
  keep: { label: "Keep", icon: Check },
  maybe: { label: "Maybe", icon: CircleQuestionMark },
  cut: { label: "Cut", icon: Scissors },
};
