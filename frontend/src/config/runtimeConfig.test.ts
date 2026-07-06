import { describe, expect, it } from "vitest";

import { getSupabaseAnonKey, getSupabaseUrl } from "./runtimeConfig";

describe("runtimeConfig", () => {
  it("reads supabase values from runtime window config", () => {
    const runtimeWindow = {
      __RUNTIME_CONFIG__: {
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon-key",
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: runtimeWindow,
    });

    expect(getSupabaseUrl()).toBe("https://example.supabase.co");
    expect(getSupabaseAnonKey()).toBe("anon-key");

    Reflect.deleteProperty(globalThis, "window");
  });
});
