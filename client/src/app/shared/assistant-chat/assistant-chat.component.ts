import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { ChatMessage } from '../../core/models/assistant.model';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';

/**
 * Floating AI assistant chat docked to the side of the screen.
 *
 * A small launcher button is always visible (for authenticated users). Clicking
 * it slides in a side panel that never covers the main content. The user types
 * free text ("הוצאת אוכל של 50 ש"ח לכולם"); the server recognises the action
 * via Gemini, executes it, and the reply is rendered here in real time over the
 * socket connection.
 */
@Component({
  selector: 'app-assistant-chat',
  imports: [FormsModule],
  templateUrl: './assistant-chat.component.html',
  styleUrl: './assistant-chat.component.scss',
})
export class AssistantChatComponent implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly socket = inject(SocketService);

  @ViewChild('scrollArea') private scrollArea?: ElementRef<HTMLDivElement>;

  protected readonly open = signal(false);
  protected readonly sending = signal(false);
  protected readonly input = signal('');
  protected readonly messages = signal<ChatMessage[]>([]);

  protected readonly suggestions = [
    'צור קבוצה חדשה בשם דירה עם דנה ויוסי',
    'הוצאת אוכל של 50 ש"ח משותף לכולם',
    'כמה אני חייב בסך הכל?',
  ];

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.socket.onChatResponse().subscribe((result) => {
        this.resolvePending(result.reply || 'בוצע.');
      })
    );

    this.subscriptions.add(
      this.socket.onChatError().subscribe((err) => {
        this.resolvePending(err.message || 'משהו השתבש. נסו שוב.');
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.socket.ensureConnected();
      if (this.messages().length === 0) {
        this.messages.set([
          {
            role: 'assistant',
            text: 'היי! אני העוזר של SplitIt. כתבו לי בשפה חופשית מה לעשות — ליצור קבוצה, להוסיף הוצאה, לסגור חוב ועוד.',
          },
        ]);
      }
      this.scrollSoon();
    }
  }

  protected useSuggestion(text: string): void {
    this.input.set(text);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    const text = this.input().trim();
    if (!text || this.sending()) {
      return;
    }

    // History is everything said so far (excluding the in-flight placeholder);
    // the server appends the new message itself, so we capture it first.
    const history = this.messages()
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, text: m.text }))
      .slice(-20);

    this.messages.update((list) => [
      ...list,
      { role: 'user', text },
      { role: 'assistant', text: '', pending: true },
    ]);
    this.input.set('');
    this.sending.set(true);

    this.socket.sendChat(text, history);
    this.scrollSoon();
  }

  private resolvePending(reply: string): void {
    this.messages.update((list) => {
      const copy = [...list];
      const idx = copy.findIndex((m) => m.pending);
      if (idx >= 0) {
        copy[idx] = { role: 'assistant', text: reply };
      } else {
        copy.push({ role: 'assistant', text: reply });
      }
      return copy;
    });
    this.sending.set(false);
    this.scrollSoon();
  }

  private scrollSoon(): void {
    setTimeout(() => {
      const el = this.scrollArea?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
