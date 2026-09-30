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

describe("status (store)", () => {
  it("sets a marquee group's status in one undo step, and moves the selection off hidden nodes", () => {
    const root = store().tree.roots[0];
    store().addChild(root);
    const a = store().selectedId!;
    store().stopEditing();
    store().addChild(a);
    const a1 = store().selectedId!;
    store().stopEditing();

    store().selectMany([a, a1]);
    store().setNodesStatus([a, a1], "maybe");
    expect([store().tree.nodes[a].status, store().tree.nodes[a1].status]).toEqual(["maybe", "maybe"]);
    store().undo();
    expect([store().tree.nodes[a].status, store().tree.nodes[a1].status]).toEqual([null, null]);

    store().select(a1);
    store().toggleCut([a]);
    expect(store().selectedId).toBe(a1); // greyed out, still there
    store().setHideCut(true);
    expect(store().selectedId).toBe(root); // hidden: the parent of the cut branch
    store().undo();
    expect(store().tree.hideCut).toBe(false);
    store().undo();
    expect(store().tree.nodes[a].status).toBeNull();
  });
});
