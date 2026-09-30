import { nanoid } from "nanoid";

import type { EdgeId, NodeId, TreeId } from "./types";

/**
 * Id generation, wrapped in one place: nothing else calls `nanoid` directly,
 * so if ids ever change shape this is the only file that moves. Ten
 * characters is plenty for a tree of a few hundred nodes and keeps saved
 * state small.
 */
const ID_LENGTH = 10;

export const createTreeId = (): TreeId => nanoid(ID_LENGTH) as TreeId;
export const createNodeId = (): NodeId => nanoid(ID_LENGTH) as NodeId;
export const createEdgeId = (): EdgeId => nanoid(ID_LENGTH) as EdgeId;

/** Casts for ids coming from outside the generator (saved state, tests). */
export const asNodeId = (value: string): NodeId => value as NodeId;
export const asEdgeId = (value: string): EdgeId => value as EdgeId;
