import { Component, inject, OnInit, signal } from '@angular/core';

import { GroupSummary } from '../../core/models/group.model';
import { AuthService } from '../../core/services/auth.service';
import { GroupService } from '../../core/services/group.service';
import { CreateGroupComponent } from '../groups/create-group/create-group.component';

@Component({
  selector: 'app-dashboard',
  imports: [CreateGroupComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly groupService = inject(GroupService);

  protected readonly groups = signal<GroupSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreateGroup = signal(false);

  ngOnInit(): void {
    this.loadGroups();
  }

  protected openCreateGroup(): void {
    this.showCreateGroup.set(true);
  }

  protected closeCreateGroup(): void {
    this.showCreateGroup.set(false);
  }

  protected onGroupCreated(): void {
    this.showCreateGroup.set(false);
    this.loadGroups();
  }

  protected loadGroups(): void {
    this.loading.set(true);
    this.error.set(null);

    this.groupService.getDashboardGroups().subscribe({
      next: (response) => {
        this.groups.set(response.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.groups.set([]);
        this.error.set('Could not load your groups. Please try again.');
        this.loading.set(false);
      },
    });
  }

  protected formatBalance(balance: number): string {
    return balance.toFixed(2);
  }

  protected adminName(group: GroupSummary): string {
    return `${group.adminId.firstName} ${group.adminId.familyName}`;
  }
}
