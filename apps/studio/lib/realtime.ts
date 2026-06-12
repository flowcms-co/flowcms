"use client";

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { API_ORIGIN } from "./api";

/**
 * Single shared socket.io connection to the API (cookie-authenticated handshake).
 * Realtime is a pure enhancement layered on top of the existing polling — if the
 * socket can't connect, the app keeps working via its poll intervals.
 */
let socket: Socket | null = null;

export function getSocket(): Socket | null {
    if (typeof window === "undefined") return null;
    if (!socket) {
        socket = io(API_ORIGIN, {
            withCredentials: true,
            transports: ["websocket", "polling"],
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
        });
    }
    return socket;
}

/** Emit an event to the server (no-op if the socket isn't ready). */
export function rtEmit(event: string, ...args: unknown[]) {
    try {
        getSocket()?.emit(event, ...args);
    } catch {
        /* socket not ready */
    }
}

/** Subscribe to a server event for the lifetime of the component. */
export function useRealtime<T = unknown>(event: string, handler: (payload: T) => void, deps: unknown[] = []) {
    useEffect(() => {
        const s = getSocket();
        if (!s) return;
        s.on(event, handler as (p: unknown) => void);
        return () => {
            s.off(event, handler as (p: unknown) => void);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}
