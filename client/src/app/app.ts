import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AssistantChatComponent } from './shared/assistant-chat/assistant-chat.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AssistantChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
