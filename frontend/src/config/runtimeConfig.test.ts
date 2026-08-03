import { describe, expect, it } from "vitest";

import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isSupabaseRuntimeConfigured,
} from "./runtimeConfig";

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

  it("rejects placeholder supabase config", () => {
    const runtimeWindow = {
      __RUNTIME_CONFIG__: {
        VITE_SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
        VITE_SUPABASE_ANON_KEY: "your-supabase-anon-public-key",
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: runtimeWindow,
    });

    expect(isSupabaseRuntimeConfigured()).toBe(false);

    Reflect.deleteProperty(globalThis, "window");
  });

  it("accepts well-formed supabase hostnames", () => {
    const runtimeWindow = {
      __RUNTIME_CONFIG__: {
        VITE_SUPABASE_URL: "https://abcd1234.supabase.co",
        VITE_SUPABASE_ANON_KEY: "eyJhbGci.test",
      },
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: runtimeWindow,
    });

    expect(isSupabaseRuntimeConfigured()).toBe(true);

    Reflect.deleteProperty(globalThis, "window");
  });
});
