import { describe, expect, it } from "vitest";

import {
  appendUniqueChatMessage,
  createOutgoingAssistantChatMessage,
  normalizeChatMessage,
} from "../../api/chat";
import { buildAssistantChatMessage } from "../sales-assistant/assistantChatMessages";
import type { SalesAssistantEvent } from "../sales-assistant/salesAssistantTypes";
import { AI_SALES_ASSISTANT_ACTOR } from "../sales-assistant/salesAssistantTypes";

describe("chat assistant broadcast helpers", () => {
  it("normalizes assistant metadata from websocket payload", () => {
    const message = normalizeChatMessage({
      id: "assistant-event-1",
      room_id: "demo",
      author: AI_SALES_ASSISTANT_ACTOR,
      text: "Cảm ơn bạn.",
      created_at: "2026-07-04T10:00:00.000Z",
      reply_to_message_id: "viewer-1",
      reply_to_author: "guest-a",
      reply_to_text: "kem chống nắng",
      commerce_actions: [
        {
          id: "add-1",
          type: "add_to_cart",
          label: "Thêm vào giỏ hàng",
          product_id: "sunscreen-01",
          quantity: 1,
        },
      ],
    });

    expect(message.replyToMessageId).toBe("viewer-1");
    expect(message.commerceActions?.[0]?.productId).toBe("sunscreen-01");
  });

  it("creates outgoing assistant payload with commerce actions", () => {
    const payload = createOutgoingAssistantChatMessage({
      id: "assistant-event-1",
      room_id: "demo",
      author: AI_SALES_ASSISTANT_ACTOR,
      text: "Cảm ơn bạn.",
      created_at: "2026-07-04T10:00:00.000Z",
      replyToMessageId: "viewer-1",
      replyToAuthor: "guest-a",
      replyToText: "kem chống nắng",
      commerceActions: [
        {
          id: "add-1",
          type: "add_to_cart",
          label: "Thêm vào giỏ hàng",
          productId: "sunscreen-01",
          quantity: 1,
        },
      ],
    });

    expect(payload.id).toBe("assistant-event-1");
    expect(payload.commerce_actions?.[0]?.product_id).toBe("sunscreen-01");
  });

  it("deduplicates chat messages by id", () => {
    const existing = [
      {
        id: "assistant-event-1",
        room_id: "demo",
        author: AI_SALES_ASSISTANT_ACTOR,
        text: "Reply",
        created_at: "2026-07-04T10:00:00.000Z",
      },
    ];

    const next = appendUniqueChatMessage(existing, existing[0]);
    expect(next).toHaveLength(1);
  });

  it("builds assistant chat message with commerce actions", () => {
    const event = {
      id: "event-1",
      suggestedReply: "Cảm ơn bạn.",
      createdAt: "2026-07-04T10:00:00.000Z",
      commerceActions: [
        {
          id: "add-1",
          type: "add_to_cart",
          label: "Thêm vào giỏ hàng",
          productId: "sunscreen-01",
        },
      ],
    } as SalesAssistantEvent;

    const message = buildAssistantChatMessage(event, {
      id: "viewer-1",
      author: "guest-a",
      text: "kem chống nắng",
      room_id: "demo",
    });

    expect(message.commerceActions?.[0]?.productId).toBe("sunscreen-01");
  });
});
