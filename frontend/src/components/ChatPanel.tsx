import { useEffect, useRef, useState } from "react";

import {
  createChatSocket,
  createOutgoingChatMessage,
  type ChatEvent,
  type ChatMessage,
} from "../api/chat";


type ChatPanelProps = {
  roomId: string;
  author: string;
  initialMessages: ChatMessage[];
};


export function ChatPanel({ roomId, author, initialMessages }: ChatPanelProps) {
  const socketRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [displayName, setDisplayName] = useState(author);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const socket = createChatSocket(roomId);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      setErrorMessage(null);
    };
    socket.onclose = () => setStatus("disconnected");
    socket.onerror = () => {
      setStatus("error");
      setErrorMessage("Chat connection error.");
    };
    socket.onmessage = (event) => {
      try {
        handleChatEvent(JSON.parse(event.data) as ChatEvent);
      } catch {
        setErrorMessage("Unable to read chat message.");
      }
    };

    return () => {
      socket.close();
    };
  }, [roomId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
    });
  }, [messages]);

  function handleChatEvent(event: ChatEvent) {
    if (event.type === "chat_history") {
      setMessages(event.messages.length > 0 ? event.messages : initialMessages);
      return;
    }

    if (event.type === "chat_message") {
      setMessages((currentMessages) => [...currentMessages, event]);
      return;
    }

    setErrorMessage(event.message);
  }

  function handleSendChatMessage() {
    const text = input.trim();
    const sender = displayName.trim();
    const socket = socketRef.current;

    if (!text || !sender || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(createOutgoingChatMessage(sender, text)));
    setInput("");
  }

  return (
    <aside className="chatPanel">
      <div className="chatHeader">
        <div>
          <h2>Live Chat</h2>
          <span>{messages.length} messages</span>
        </div>
        <span className={`status ${status}`}>WS: {status}</span>
      </div>
      <label className="chatDisplayName">
        <span>Display name</span>
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={32}
          placeholder="Display name"
        />
      </label>
      <div className="chatMessages" ref={messagesRef}>
        {messages.map((message) => (
          <div className="chatMessage" key={message.id}>
            <strong>{message.author}</strong>
            <span>{message.text}</span>
          </div>
        ))}
      </div>
      {errorMessage ? <div className="error">{errorMessage}</div> : null}
      <div className="chatInputRow">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSendChatMessage();
            }
          }}
          maxLength={300}
          placeholder="Send a message..."
        />
        <button type="button" onClick={handleSendChatMessage}>
          Send
        </button>
      </div>
    </aside>
  );
}
