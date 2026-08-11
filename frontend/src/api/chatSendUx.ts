export const CLIENT_SEND_COOLDOWN_MS = 1000;

export type ChatSpamErrorCode = "comment_rate_limited" | "comment_temporarily_blocked";

export function isChatSpamErrorCode(code: string): code is ChatSpamErrorCode {
  return code === "comment_rate_limited" || code === "comment_temporarily_blocked";
}

export function remainingSecondsUntil(untilMs: number, nowMs: number = Date.now()): number {
  if (untilMs <= nowMs) {
    return 0;
  }
  return Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
}

export function isChatSendDisabled(
  nowMs: number,
  sendCooldownUntilMs: number,
  retryUntilMs: number,
): boolean {
  return nowMs < sendCooldownUntilMs || nowMs < retryUntilMs;
}

export function formatChatSpamGuardMessage(
  code: ChatSpamErrorCode,
  retryAfterSeconds: number,
  t: (key: "chatRateLimited" | "chatTemporarilyBlocked", params?: Record<string, number>) => string,
): string {
  const seconds = Math.max(0, Math.ceil(retryAfterSeconds));
  if (code === "comment_temporarily_blocked") {
    return t("chatTemporarilyBlocked", { seconds });
  }
  return t("chatRateLimited", { seconds });
}
