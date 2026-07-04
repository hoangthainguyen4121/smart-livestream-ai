import type { ChatMessage } from "../api/chat";

/** Sample chat messages for manual/testing use only — not used on DemoPage live path. */
export const DEMO_CHAT_FIXTURES: ChatMessage[] = [
  {
    id: "demo-fixture-1",
    room_id: "demo",
    author: "Minh",
    text: "Hello!",
    created_at: "",
  },
  {
    id: "demo-fixture-2",
    room_id: "demo",
    author: "An",
    text: "Nice stream!",
    created_at: "",
  },
];
