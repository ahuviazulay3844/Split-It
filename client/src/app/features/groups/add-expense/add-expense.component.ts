import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';

import { CategoryRef, CreateExpensePayload, ExpenseSplitInput } from '../../../core/models/expense.model';
import { GroupMemberView } from '../../../core/models/group.model';
import { GroupService } from '../../../core/services/group.service';

/** Validates a money amount: a finite, positive number with at most 2 decimals. */
const moneyValidator = (control: AbstractControl): ValidationErrors | null => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') {
    return null; // `required` handles emptiness.
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { money: true };
  }
  if (value <= 0) {
    return { positive: true };
  }
  if (Math.round(value * 100) !== value * 100) {
    return { decimals: true };
  }
  if (value > 1_000_000) {
    return { max: true };
  }
  return null;
};

@Component({
  selector: 'app-add-expense',
  imports: [ReactiveFormsModule],
  templateUrl: './add-expense.component.html',
})
export class AddExpenseComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly groupService = inject(GroupService);

  readonly groupId = input.required<string>();
  readonly members = input.required<GroupMemberView[]>();
  readonly categories = input.required<CategoryRef[]>();
  readonly currentUserId = input.required<string>();

  readonly closed = output<void>();
  readonly created = output<void>();

  /** Members who actually share this expense (defaults to everyone). */
  protected readonly selectedParticipants = signal<Set<string>>(new Set());
  protected readonly submitted = signal(false);
  protected errorMessage: string | null = null;
  protected loadingState = false;

  protected readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.maxLength(200)]],
    amount: ['', [Validators.required, moneyValidator]],
    categoryId: [''],
  });

  ngOnInit(): void {
    this.selectedParticipants.set(new Set(this.members().map((m) => m.user._id)));
  }

  protected isParticipant(userId: string): boolean {
    return this.selectedParticipants().has(userId);
  }

  protected toggleParticipant(userId: string): void {
    this.selectedParticipants.update((set) => {
      const next = new Set(set);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  protected get allSelected(): boolean {
    return this.selectedParticipants().size === this.members().length;
  }

  protected toggleAll(): void {
    if (this.allSelected) {
      this.selectedParticipants.set(new Set());
    } else {
      this.selectedParticipants.set(new Set(this.members().map((m) => m.user._id)));
    }
  }

  protected memberName(member: GroupMemberView): string {
    return `${member.user.firstName} ${member.user.familyName}`;
  }

  protected close(): void {
    this.closed.emit();
  }

  protected amountError(): string | null {
    const control = this.form.controls.amount;
    if (!control.touched && !this.submitted()) {
      return null;
    }
    const errors = control.errors;
    if (!errors) {
      return null;
    }
    if (errors['required']) {
      return 'יש להזין סכום';
    }
    if (errors['money']) {
      return 'הסכום חייב להיות מספר תקין';
    }
    if (errors['positive']) {
      return 'הסכום חייב להיות גדול מ-0';
    }
    if (errors['decimals']) {
      return 'ניתן להשתמש בעד שתי ספרות אחרי הנקודה';
    }
    if (errors['max']) {
      return 'הסכום גבוה מדי';
    }
    return null;
  }

  protected descriptionError(): string | null {
    const control = this.form.controls.description;
    if ((!control.touched && !this.submitted()) || !control.errors) {
      return null;
    }
    if (control.errors['maxlength']) {
      return 'התיאור יכול להכיל עד 200 תווים';
    }
    return null;
  }

  protected participantsError(): string | null {
    if (!this.submitted()) {
      return null;
    }
    return this.selectedParticipants().size === 0 ? 'יש לבחור לפחות משתתף/ת אחד/ת' : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    this.errorMessage = null;

    if (this.form.invalid || this.selectedParticipants().size === 0) {
      this.form.markAllAsTouched();
      return;
    }

    const amount = Number(this.form.controls.amount.value);
    const description = this.form.controls.description.value.trim();
    const categoryId = this.form.controls.categoryId.value;

    // The logged-in user is always the payer; only participants are chosen.
    const payload: CreateExpensePayload = {
      groupId: this.groupId(),
      amount,
      payerId: this.currentUserId(),
      ...(description ? { description } : {}),
      ...(categoryId ? { categoryId } : {}),
    };

    // Always send explicit splits so the server divides only among the chosen
    // participants, never defaulting to the full active-member list.
    payload.splits = this.buildEqualSplits(amount);

    this.loadingState = true;
    this.groupService.addExpense(payload).subscribe({
      next: () => {
        this.loadingState = false;
        this.created.emit();
      },
      error: (err) => {
        this.loadingState = false;
        if (err.status === 400) {
          this.errorMessage = 'יש לבדוק את פרטי ההוצאה והמשתתפים שנבחרו.';
          return;
        }
        if (err.status === 403) {
          this.errorMessage = 'אין לך הרשאה להוסיף הוצאה בקבוצה הזו.';
          return;
        }
        this.errorMessage = 'הוספת ההוצאה נכשלה. נסו שוב.';
      },
    });
  }

  /**
   * Splits `amount` equally among the selected participants in integer cents so
   * the shares always add up to the exact total (server enforces this).
   */
  private buildEqualSplits(amount: number): ExpenseSplitInput[] {
    const ids = [...this.selectedParticipants()];
    const totalCents = Math.round(amount * 100);
    const base = Math.floor(totalCents / ids.length);
    let remainder = totalCents - base * ids.length;

    return ids.map((userId) => {
      const cents = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) {
        remainder -= 1;
      }
      return { userId, amount: cents / 100 };
    });
  }
}
