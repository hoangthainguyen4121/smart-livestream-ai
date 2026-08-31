import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthToken,
  getAuthToken,
  getCurrentUser,
  loginWithPassword,
  registerWithPassword,
} from "./auth";

describe("password auth API", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    values.clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("logs in and persists bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        token: "jwt-1",
        user: { id: "u1", email: "seller@example.com", display_name: "Seller" },
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const user = await loginWithPassword("seller@example.com", "secret1");
    expect(user.displayName).toBe("Seller");
    expect(getAuthToken()).toBe("jwt-1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: "seller@example.com",
      password: "secret1",
    });
  });

  it("registers then loads and clears current user", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "jwt-2",
        user: { id: "u2", email: "new@example.com" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "u2", email: "new@example.com",
      }), { status: 200 })));

    await registerWithPassword("new@example.com", "secret2", "New");
    expect((await getCurrentUser())?.id).toBe("u2");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});
