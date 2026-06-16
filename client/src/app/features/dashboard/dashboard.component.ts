import { Component, inject, OnInit, signal } from '@angular/core';

import { Dashboard } from '../../core/models/dashboard.model';
import { GroupSummary } from '../../core/models/group.model';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { CreateGroupComponent } from '../groups/create-group/create-group.component';

@Component({
  selector: 'app-dashboard',
  imports: [CreateGroupComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);

  protected readonly dashboard = signal<Dashboard | null>(null);
  protected readonly groups = signal<GroupSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreateGroup = signal(false);

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
        this.dashboard.set(response.data ?? null);
        this.groups.set(response.data?.groups ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.dashboard.set(null);
        this.groups.set([]);
        this.error.set('Could not load your dashboard. Please try again.');
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
