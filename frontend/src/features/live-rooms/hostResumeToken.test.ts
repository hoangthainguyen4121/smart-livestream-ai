import { beforeEach, describe, expect, it, vi } from "vitest";

describe("hostResumeToken", () => {
  beforeEach(() => {
    vi.resetModules();
    const store = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    };
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("localStorage", localStorage);
  });

  it("persists and reads a host resume token by room id", async () => {
    const {
      saveHostResumeToken,
      getHostResumeToken,
      clearHostResumeToken,
    } = await import("./hostResumeToken");

    saveHostResumeToken("room-a", "token-123", "session-1");
    expect(getHostResumeToken("room-a")).toBe("token-123");
    clearHostResumeToken("room-a");
    expect(getHostResumeToken("room-a")).toBeNull();
  });
});
