import { beforeEach, describe, expect, it, vi } from "vitest";

describe("getOrCreateWebrtcPeerId", () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    };
    vi.stubGlobal("window", { sessionStorage });
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-3333-4444-555555555555",
    });
  });

  it("creates a stable peer id in sessionStorage (not display name)", async () => {
    const { getOrCreateWebrtcPeerId } = await import("./peerId");
    const first = getOrCreateWebrtcPeerId();
    const second = getOrCreateWebrtcPeerId();
    expect(first).toBe("peer-11111111-2222-3333-4444-555555555555");
    expect(second).toBe(first);
    expect(first.includes("guest")).toBe(false);
  });
});
