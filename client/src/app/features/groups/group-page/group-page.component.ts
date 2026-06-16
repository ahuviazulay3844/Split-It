import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { CategoryRef, Expense } from '../../../core/models/expense.model';
import { GroupOverview, PersonalBalance } from '../../../core/models/group.model';
import { AuthService } from '../../../core/services/auth.service';
import { GroupService } from '../../../core/services/group.service';
import { PieCardComponent } from '../../../shared/charts/pie-card/pie-card.component';
import { AddExpenseComponent } from '../add-expense/add-expense.component';

interface ChartData {
  labels: string[];
  series: number[];
}

@Component({
  selector: 'app-group-page',
  imports: [RouterLink, PieCardComponent, AddExpenseComponent],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly groupService = inject(GroupService);
  protected readonly auth = inject(AuthService);

  protected readonly groupId = signal('');
  protected readonly overview = signal<GroupOverview | null>(null);
  protected readonly balance = signal<PersonalBalance | null>(null);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly categories = signal<CategoryRef[]>([]);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly showAddExpense = signal(false);
  /** Tracks which settlementId is currently being confirmed, if any. */
  protected readonly settlingId = signal<string | null>(null);

  protected readonly currentUserId = computed(() => this.auth.user()?._id ?? '');

  /** The logged-in user is an admin of this group (drives the manager view). */
  protected readonly isAdmin = computed(() => {
    const ov = this.overview();
    if (!ov) {
      return false;
    }
    const me = ov.members.find((m) => m.user._id === this.currentUserId());
    return me?.roleInGroup === 'Admin';
  });

  /** Expense distribution by category (sum of amounts per category). */
  protected readonly categoryChart = computed<ChartData>(() => {
    const totals = new Map<string, number>();
    for (const exp of this.expenses()) {
      const name = exp.categoryId?.name ?? 'ללא קטגוריה';
      totals.set(name, (totals.get(name) ?? 0) + exp.amount);
    }
    return this.toChartData(totals);
  });

  /**
   * Spending by user: how much each member actually paid (spent), attributed to
   * the expense payer. The pie card renders each slice as a share of the total
   * expenditure, so a member who paid ₪500 of a ₪510 total shows as ~98%.
   */
  protected readonly userChart = computed<ChartData>(() => {
    const names = this.userNameMap();
    const totals = new Map<string, number>();

    for (const exp of this.expenses()) {
      const name = names.get(exp.payerId._id) ?? this.userName(exp.payerId);
      totals.set(name, (totals.get(name) ?? 0) + exp.amount);
    }
    return this.toChartData(totals);
  });

  protected readonly stats = computed(() => {
    const ov = this.overview();
    const count = this.expenses().length;
    const total = ov?.group.totalExpenses ?? 0;
    return {
      totalExpenses: total,
      avgPerPerson: ov?.group.avgPerPerson ?? 0,
      memberCount: ov?.group.memberCount ?? 0,
      expenseCount: count,
      avgPerExpense: count > 0 ? total / count : 0,
    };
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('groupId') ?? '';
    this.groupId.set(id);
    this.loadAll();
  }

  protected loadAll(): void {
    const id = this.groupId();
    if (!id) {
      this.error.set('קבוצה לא תקינה.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      overview: this.groupService.getOverview(id),
      balance: this.groupService.getMyBalance(id),
      expenses: this.groupService.getExpenses(id),
      categories: this.groupService.getCategories(),
    }).subscribe({
      next: ({ overview, balance, expenses, categories }) => {
        this.overview.set(overview.data ?? null);
        this.balance.set(balance.data ?? null);
        this.expenses.set(expenses.data ?? []);
        this.categories.set(this.filterPickerCategories(categories.data ?? []));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          err.status === 403
            ? 'אין לך הרשאה לצפות בקבוצה הזו.'
            : 'לא ניתן לטעון את הקבוצה. נסו שוב.'
        );
        this.loading.set(false);
      },
    });
  }

  protected openAddExpense(): void {
    this.showAddExpense.set(true);
  }

  protected closeAddExpense(): void {
    this.showAddExpense.set(false);
  }

  /** Refresh everything from the server after a successful add (no page reload). */
  protected onExpenseAdded(): void {
    this.showAddExpense.set(false);
    this.loadAll();
  }

  /** Marks a settlement as paid, then re-fetches the full group state. */
  protected markAsPaid(settlementId: string): void {
    if (this.settlingId()) {
      return;
    }
    this.settlingId.set(settlementId);
    this.groupService.settleDebt(settlementId).subscribe({
      next: () => {
        this.settlingId.set(null);
        this.loadAll();
      },
      error: () => {
        this.settlingId.set(null);
      },
    });
  }

  protected userName(user: { firstName: string; familyName: string }): string {
    return `${user.firstName} ${user.familyName}`;
  }

  protected format(value: number): string {
    return value.toFixed(2);
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

  private userNameMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const m of this.overview()?.members ?? []) {
      map.set(m.user._id, `${m.user.firstName} ${m.user.familyName}`);
    }
    return map;
  }

  /** Hide legacy English defaults; empty selection already maps to General on the server. */
  private filterPickerCategories(categories: CategoryRef[]): CategoryRef[] {
    const legacy = new Set(['Food', 'General']);
    return categories.filter((category) => !legacy.has(category.name));
  }

  private toChartData(totals: Map<string, number>): ChartData {
    const entries = [...totals.entries()]
      .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    return {
      labels: entries.map((e) => e.label),
      series: entries.map((e) => e.value),
    };
  }
}
