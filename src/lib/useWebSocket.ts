"use client";

import { useEffect, useRef, useState } from "react";

export type WsStatus = "connecting" | "open" | "closed";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 15000;

/**
 * Connects to /ws and reconnects with exponential backoff on drop -- not
 * tied to any one feature's message shape, so a future live feature (e.g.
 * a host dashboard watching RSVP counts) can subscribe to its own message
 * `type` over the same connection instead of opening a second socket.
 *
 * Returns the current connection status and the most recent message of
 * each `type` seen so far, keyed by type -- callers read
 * `messagesByType["heartbeat"]` rather than filtering a message list
 * themselves.
 */
export function useWebSocket() {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [messagesByType, setMessagesByType] = useState<Record<string, WsMessage>>({});
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

      ws.onopen = () => {
        if (cancelled) return;
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message: WsMessage = JSON.parse(event.data);
          if (typeof message.type === "string") {
            setMessagesByType((prev) => ({ ...prev, [message.type]: message }));
          }
        } catch {
          // Ignore malformed messages rather than crashing the connection.
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, MAX_RECONNECT_DELAY_MS);
          connect();
        }, reconnectDelayRef.current);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      ws?.close();
    };
  }, []);

  return { status, messagesByType };
}
