import { beforeAll, describe, expect, it, vi } from "vitest";

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

describe("forkBranch (store)", () => {
  it("selects the new root, opens it for naming, and undoes fork + name as one step", () => {
    const root = store().tree.roots[0];
    store().renameNode(root, "Start");
    store().addChild(root);
    const child = store().selectedId!;
    store().renameNode(child, "Yes");
    store().stopEditing();

    store().forkBranch(child);
    const fork = store().selectedId!;
    expect(store().tree.roots).toEqual([root, fork]);
    expect(store().editingId).toBe(fork);
    expect(store().tree.nodes[fork].title).toBe("Start — Yes");

    store().renameNode(fork, "What if yes");
    store().stopEditing();
    store().undo();
    expect(store().tree.roots).toEqual([root]);
    store().redo();
    expect(store().tree.nodes[store().tree.roots[1]].title).toBe("What if yes");
  });
});
