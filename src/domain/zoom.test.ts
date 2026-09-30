import { describe, expect, it } from "vitest";

import { clampZoom, ZOOM_MAX, ZOOM_MIN, zoomedIn, zoomedOut } from "./zoom";

describe("zoom steps", () => {
  it("steps by 10% without floating-point drift", () => {
    expect(zoomedIn(1)).toBe(1.1);
    expect(zoomedIn(zoomedIn(0.1 + 0.2 + 0.5))).toBe(1);
    expect(zoomedOut(1)).toBe(0.9);
  });

  it("stops at the ends of the range", () => {
    expect(zoomedIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomedOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(clampZoom(5)).toBe(ZOOM_MAX);
  });
});
