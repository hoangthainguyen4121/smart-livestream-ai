import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearHostedRoomsForTests,
  isLocalHostForRoom,
  markRoomAsHosted,
} from "./hostedRooms";

describe("hostedRooms local claim", () => {
  afterEach(() => {
    clearHostedRoomsForTests();
    vi.unstubAllGlobals();
  });

  it("marks created room as local host", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    expect(isLocalHostForRoom("room-a")).toBe(false);
    markRoomAsHosted("room-a");
    expect(isLocalHostForRoom("room-a")).toBe(true);
    expect(isLocalHostForRoom("room-b")).toBe(false);
  });
});
