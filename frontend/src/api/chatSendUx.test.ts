import { describe, expect, it } from "vitest";

import { createOutgoingChatMessage } from "./chat";
import {
  CLIENT_SEND_COOLDOWN_MS,
  formatChatSpamGuardMessage,
  isChatSendDisabled,
  isChatSpamErrorCode,
  remainingSecondsUntil,
} from "./chatSendUx";

describe("createOutgoingChatMessage", () => {
  it("includes viewer_key when provided", () => {
    expect(createOutgoingChatMessage("guest", "hello", "viewer-key-12345678")).toEqual({
      type: "chat_message",
      author: "guest",
      text: "hello",
      viewer_key: "viewer-key-12345678",
    });
  });
});

describe("chatSendUx", () => {
  it("detects spam guard error codes", () => {
    expect(isChatSpamErrorCode("comment_rate_limited")).toBe(true);
    expect(isChatSpamErrorCode("comment_temporarily_blocked")).toBe(true);
    expect(isChatSpamErrorCode("no_active_session")).toBe(false);
  });

  it("disables send during 1 second client cooldown", () => {
    const now = 1_000;
    expect(isChatSendDisabled(now, now + CLIENT_SEND_COOLDOWN_MS, 0)).toBe(true);
    expect(isChatSendDisabled(now + CLIENT_SEND_COOLDOWN_MS, now + CLIENT_SEND_COOLDOWN_MS, 0)).toBe(
      false,
    );
  });

  it("disables send while backend retry window is active", () => {
    const now = 5_000;
    expect(isChatSendDisabled(now, 0, now + 4_000)).toBe(true);
    expect(remainingSecondsUntil(now + 4_000, now)).toBe(4);
  });

  it("formats backend retry messages", () => {
    const t = (key: "chatRateLimited" | "chatTemporarilyBlocked", params?: Record<string, number>) =>
      `${key}:${params?.seconds ?? 0}`;

    expect(formatChatSpamGuardMessage("comment_rate_limited", 4, t)).toBe(
      "chatRateLimited:4",
    );
    expect(formatChatSpamGuardMessage("comment_temporarily_blocked", 117, t)).toBe(
      "chatTemporarilyBlocked:117",
    );
  });
});
