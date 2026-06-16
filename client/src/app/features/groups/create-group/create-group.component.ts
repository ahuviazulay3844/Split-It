import { Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, filter, switchMap } from 'rxjs';

import { UserSummary } from '../../../core/models/group.model';
import { GroupService } from '../../../core/services/group.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-create-group',
  imports: [ReactiveFormsModule],
  templateUrl: './create-group.component.html',
  styleUrl: './create-group.component.scss',
})
export class CreateGroupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly groupService = inject(GroupService);
  private readonly userService = inject(UserService);

  readonly closed = output<void>();
  readonly created = output<void>();

  protected readonly searchResults = signal<UserSummary[]>([]);
  protected readonly selectedMembers = signal<UserSummary[]>([]);
  protected readonly searching = signal(false);
  protected errorMessage: string | null = null;
  protected loadingState = false;

  protected readonly form = this.fb.nonNullable.group({
    groupName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    memberSearch: [''],
  });

  constructor() {
    this.form.controls.memberSearch.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        filter((q) => q.trim().length >= 2),
        switchMap((q) => {
          this.searching.set(true);
          return this.userService.searchUsers(q.trim());
        })
      )
      .subscribe({
        next: (response) => {
          this.searching.set(false);
          const selectedIds = new Set(this.selectedMembers().map((m) => m._id));
          const results = (response.data ?? []).filter((u) => !selectedIds.has(u._id));
          this.searchResults.set(results);
        },
        error: () => {
          this.searching.set(false);
          this.searchResults.set([]);
        },
      });
  }

  protected close(): void {
    this.closed.emit();
  }

  protected addMember(user: UserSummary): void {
    const alreadySelected = this.selectedMembers().some((m) => m._id === user._id);
    if (alreadySelected) {
      return;
    }

    this.selectedMembers.update((members) => [...members, user]);
    this.searchResults.update((results) => results.filter((u) => u._id !== user._id));
    this.form.controls.memberSearch.setValue('');
  }

  protected removeMember(userId: string): void {
    this.selectedMembers.update((members) => members.filter((m) => m._id !== userId));
  }

  protected submit(): void {
    if (this.form.controls.groupName.invalid) {
      this.form.controls.groupName.markAsTouched();
      return;
    }

    // A group must have at least 2 people (you + one other). This mirrors the
    // rule the server enforces, so we block an invalid request up front.
    if (this.selectedMembers().length < 1) {
      this.errorMessage = 'A group needs at least one other member (you make two).';
      return;
    }

    this.loadingState = true;
    this.errorMessage = null;

    const groupName = this.form.controls.groupName.getRawValue().trim();
    const memberIds = this.selectedMembers().map((m) => m._id);

    this.groupService.createGroup({ groupName, memberIds }).subscribe({
      next: () => {
        this.loadingState = false;
        this.created.emit();
      },
      error: (err) => {
        this.loadingState = false;
        this.errorMessage = err.error?.message ?? 'Failed to create group. Please try again.';
      },
    });
  }

  protected groupNameError(): string | null {
    const control = this.form.controls.groupName;
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return 'Group name is required';
    }

    if (control.errors['minlength']) {
      return `Group name must be at least ${control.errors['minlength'].requiredLength} characters`;
    }

    if (control.errors['maxlength']) {
      return `Group name must be at most ${control.errors['maxlength'].requiredLength} characters`;
    }

    return null;
  }

  protected memberLabel(user: UserSummary): string {
    return `${user.firstName} ${user.familyName}`;
  }
}
