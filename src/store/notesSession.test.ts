import { beforeAll, describe, expect, it, vi } from "vitest";

import type { NodeId } from "../domain/types";

/** A minimal in-memory localStorage: the store reads it when it loads. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

let useTreeStore: typeof import("./treeStore").useTreeStore;

beforeAll(async () => {
  vi.stubGlobal("localStorage", memoryStorage());
  ({ useTreeStore } = await import("./treeStore"));
});

const store = () => useTreeStore.getState();
const notesOf = (id: NodeId) => store().tree.nodes[id].notes;

describe("notes editing session", () => {
  it("undoes a whole session in one step, not one per keystroke", () => {
    const root = store().tree.roots[0];
    store().openNotes(root);
    for (const text of ["H", "He", "He r", "He runs"]) store().setNotes(root, text);
    expect(notesOf(root)).toBe("He runs");
    store().closeNotes();

    store().undo();
    expect(notesOf(root)).toBe("");
    store().redo();
    expect(notesOf(root)).toBe("He runs");
  });

  it("starts a new step when the panel switches to another node", () => {
    const root = store().tree.roots[0];
    store().addChild(root);
    const child = store().selectedId!;
    store().stopEditing();

    store().openNotes(root);
    store().setNotes(root, "He runs. Fast.");
    store().select(child); // the panel follows the selection
    expect(store().notesOpen).toBe(true);
    store().setNotes(child, "Caught");
    store().select(root);
    store().setNotes(root, "He runs. Fast. Away.");

    store().undo();
    expect(notesOf(root)).toBe("He runs. Fast.");
    expect(notesOf(child)).toBe("Caught");
    store().undo();
    expect(notesOf(child)).toBe("");
    store().undo();
    expect(notesOf(root)).toBe("He runs");
  });

  it("does not fold typing into an unrelated edit made in between", () => {
    const root = store().tree.roots[0];
    store().openNotes(root);
    store().setNotes(root, "one");
    store().setNodeColor(root, "red");
    store().setNotes(root, "one two");

    store().undo();
    expect(notesOf(root)).toBe("one");
    expect(store().tree.nodes[root].color).toBe("red");
  });

  it("closes when nothing is selected", () => {
    const root = store().tree.roots[0];
    store().openNotes(root);
    store().select(null);
    expect(store().notesOpen).toBe(false);
  });
});
