import { describe, expect, it } from "vitest";

import { cvTestPath, liveRoomPath, parseHashRoute, roomsPath } from "./hashRoute";

describe("parseHashRoute", () => {
  it("defaults to rooms landing", () => {
    expect(parseHashRoute("")).toEqual({ name: "rooms" });
    expect(parseHashRoute("#")).toEqual({ name: "rooms" });
    expect(parseHashRoute("#/")).toEqual({ name: "rooms" });
  });

  it("parses live room detail", () => {
    expect(parseHashRoute("#/live/fashion-live-abc")).toEqual({
      name: "live",
      roomId: "fashion-live-abc",
    });
  });

  it("keeps admin route", () => {
    expect(parseHashRoute("#/admin/intent-corrections")).toEqual({ name: "admin" });
  });

  it("parses CV test harness route", () => {
    expect(parseHashRoute("#/dev/cv-test")).toEqual({ name: "cvTest" });
    expect(cvTestPath()).toBe("#/dev/cv-test");
  });

  it("builds live path", () => {
    expect(liveRoomPath("a b")).toBe("#/live/a%20b");
    expect(roomsPath()).toBe("#/");
  });
});
