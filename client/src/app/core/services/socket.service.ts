import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

/**
 * Thin wrapper around socket.io-client.
 *
 * Connects to the same host the Angular dev server is running on; the proxy
 * config forwards /socket.io WebSocket upgrades to the Express/Socket.io
 * server on port 3000.
 *
 * Group-page components call joinGroup() on init and leaveGroup() on destroy
 * so the server can broadcast targeted 'group:updated' events.
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private readonly socket: Socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });

  joinGroup(groupId: string): void {
    this.socket.emit('join:group', groupId);
  }

  leaveGroup(groupId: string): void {
    this.socket.emit('leave:group', groupId);
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
