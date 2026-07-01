import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Dashboard } from '../../core/models/dashboard.model';
import { GroupSummary } from '../../core/models/group.model';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { CreateGroupComponent } from '../groups/create-group/create-group.component';

@Component({
  selector: 'app-dashboard',
  imports: [CreateGroupComponent, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);

  protected readonly dashboard = signal<Dashboard | null>(null);
  protected readonly groups = signal<GroupSummary[]>([]);
  protected readonly activeGroups = signal<GroupSummary[]>([]);
  protected readonly closedGroups = signal<GroupSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreateGroup = signal(false);

  /** Which tab is selected in the personal area: active (default) or closed groups. */
  protected readonly view = signal<'active' | 'closed'>('active');

  /** Groups shown for the currently selected tab. */
  protected readonly visibleGroups = computed(() =>
    this.view() === 'closed' ? this.closedGroups() : this.activeGroups()
  );

  ngOnInit(): void {
    this.loadDashboard();
  }

  protected openCreateGroup(): void {
    this.showCreateGroup.set(true);
  }

  protected closeCreateGroup(): void {
    this.showCreateGroup.set(false);
  }

  protected onGroupCreated(): void {
    this.showCreateGroup.set(false);
    this.loadDashboard();
  }

  protected loadDashboard(): void {
    this.loading.set(true);
    this.error.set(null);

    this.dashboardService.getDashboard().subscribe({
      next: (response) => {
        const data = response.data ?? null;
        const allGroups = data?.groups ?? [];
        this.dashboard.set(data);
        this.groups.set(allGroups);
        // Prefer the server split; fall back to deriving it from status for safety.
        this.activeGroups.set(data?.activeGroups ?? allGroups.filter((g) => g.status !== 'closed'));
        this.closedGroups.set(data?.closedGroups ?? allGroups.filter((g) => g.status === 'closed'));
        this.loading.set(false);
      },
      error: () => {
        this.dashboard.set(null);
        this.groups.set([]);
        this.activeGroups.set([]);
        this.closedGroups.set([]);
        this.error.set('לא ניתן לטעון את הקבוצות שלי. נסו שוב.');
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

  protected balanceClass(value: number): string {
    if (value > 0) {
      return 'text-emerald-300';
    }
    if (value < 0) {
      return 'text-red-300';
    }
    return 'text-slate-400';
  }

  protected balanceLabel(value: number): string {
    if (value > 0) {
      return 'חייבים לך';
    }
    if (value < 0) {
      return 'החוב שלך';
    }
    return 'מאוזן';
  }

  protected roleLabel(group: GroupSummary): string {
    return group.roleInGroup === 'Admin' ? 'מנהל/ת' : 'חבר/ה';
  }

  protected setView(view: 'active' | 'closed'): void {
    this.view.set(view);
  }
}
