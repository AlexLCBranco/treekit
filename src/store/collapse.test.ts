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

describe("folding a marquee group (store)", () => {
  it("folds every branch in one undo step and drops group members it hides", () => {
    const root = store().tree.roots[0];
    store().addChild(root);
    const a = store().selectedId!;
    store().stopEditing();
    store().addChild(a);
    const a1 = store().selectedId!;
    store().stopEditing();
    store().addChild(a1);
    store().stopEditing();

    // a1 is the primary; folding a hides it, so the selection moves to a.
    store().selectMany([root, a, a1]);
    store().toggleCollapsedNodes([root, a, a1]);
    expect(store().tree.nodes[a].collapsed).toBe(true);
    expect(store().tree.nodes[a1].collapsed).toBe(true);
    expect(store().selectedId).toBe(root);
    expect(store().selectedIds).toEqual([root]);

    store().undo();
    expect([store().tree.nodes[root].collapsed, store().tree.nodes[a].collapsed]).toEqual([false, false]);
  });
});
