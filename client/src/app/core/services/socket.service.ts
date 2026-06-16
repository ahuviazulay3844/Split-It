import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { TOKEN_STORAGE_KEY } from '../constants/auth.constants';
import { ChatHistoryTurn, ChatResult } from '../models/assistant.model';

/**
 * Thin wrapper around socket.io-client.
 *
 * The server authenticates every socket from its handshake (the same JWT used
 * by the REST API), so we pass the token via `auth`. It is a function, so the
 * token is read fresh on each (re)connection — important because the socket may
 * be created before the user has logged in.
 *
 * Connects to the same host the Angular dev server is running on; the proxy
 * config forwards /socket.io WebSocket upgrades to the Express/Socket.io server
 * on port 3000.
 *
 * Group-page components call joinGroup()/leaveGroup(); the assistant chat panel
 * uses sendChat()/onChatResponse(). All of them must first ensureConnected().
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly socket: Socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth: (cb: (data: Record<string, unknown>) => void) =>
      cb({ token: localStorage.getItem(TOKEN_STORAGE_KEY) ?? '' }),
  });

  /**
   * Opens the connection if it is not already active. Safe to call repeatedly.
   * A manual (re)connect is required because middleware auth rejections do not
   * auto-reconnect — so we call this right after the user is authenticated.
   */
  ensureConnected(): void {
    if (!this.socket.active) {
      this.socket.connect();
    }
  }

  joinGroup(groupId: string): void {
    this.ensureConnected();
    this.socket.emit('join:group', groupId);
  }

  leaveGroup(groupId: string): void {
    this.socket.emit('leave:group', groupId);
  }

  /** Sends a free-text message to the AI assistant for action recognition. */
  sendChat(message: string, history: ChatHistoryTurn[] = []): void {
    this.ensureConnected();
    this.socket.emit('chat:message', { message, history });
  }

  /** Emits once per processed chat message with the assistant's reply + action. */
  onChatResponse(): Observable<ChatResult> {
    return new Observable((observer) => {
      const handler = (data: ChatResult) => observer.next(data);
      this.socket.on('chat:response', handler);
      return () => {
        this.socket.off('chat:response', handler);
      };
    });
  }

  /** Emits when the assistant could not process a message. */
  onChatError(): Observable<{ message: string }> {
    return new Observable((observer) => {
      const handler = (data: { message: string }) => observer.next(data);
      this.socket.on('chat:error', handler);
      return () => {
        this.socket.off('chat:error', handler);
      };
    });
  }

  /** Emits every time any member of the joined group adds an expense or settles a debt. */
  onGroupUpdated(): Observable<{ groupId: string }> {
    return new Observable((observer) => {
      const handler = (data: { groupId: string }) => observer.next(data);
      this.socket.on('group:updated', handler);
      return () => {
        this.socket.off('group:updated', handler);
      };
    });
  }

  ngOnDestroy(): void {
    this.socket.disconnect();
  }
}
