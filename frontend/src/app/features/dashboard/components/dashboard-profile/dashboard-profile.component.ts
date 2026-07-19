import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { Profile, UpdateProfileDto } from '@finmate/data-models';

export const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (CET)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'China (CST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
];

export const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-IN', label: 'English (India)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ja-JP', label: 'Japanese (Japan)' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

@Component({
  selector: 'app-dashboard-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dashboard-profile.component.html',
})
export class DashboardProfileComponent implements OnChanges {
  private authService = inject(AuthService);

  // ── Inputs from parent ──────────────────────────────────────────────────
  @Input() userName = '';
  @Input() userEmail = '';
  @Input() userDisplayName = '';
  @Input() userProfile: Profile | null = null;
  @Input() personalExpensesCount = 0;
  @Input() incomePercentage = 0;
  @Input() isLoggingOut = false;

  // ── Outputs ─────────────────────────────────────────────────────────────
  @Output() logoutEvent = new EventEmitter<void>();
  @Output() profileUpdated = new EventEmitter<any>();

  // ── Edit state ──────────────────────────────────────────────────────────
  editDisplayName = '';
  editTimezone = 'Asia/Kolkata';
  editLocale = 'en-IN';
  avatarPreviewUrl: string | null = null;
  pendingAvatarDataUrl: string | null = null; // null = no change, '' = remove

  // ── Save state ──────────────────────────────────────────────────────────
  isSavingProfile = false;
  profileSaveSuccess = '';
  profileSaveError = '';
  avatarSizeWarning = '';

  // ── Options ─────────────────────────────────────────────────────────────
  readonly timezoneOptions = TIMEZONE_OPTIONS;
  readonly localeOptions = LOCALE_OPTIONS;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userDisplayName'] || changes['userProfile']) {
      this.syncEditState();
    }
  }

  syncEditState(): void {
    this.editDisplayName = this.userDisplayName || this.userName || '';
    this.editTimezone =
      this.userProfile?.timezone || 'Asia/Kolkata';
    this.editLocale = this.userProfile?.locale || 'en-IN';
    this.avatarPreviewUrl = this.userProfile?.avatarUrl || null;
    this.pendingAvatarDataUrl = null;
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const maxBytes = 500 * 1024; // 500 KB
    if (file.size > maxBytes) {
      this.avatarSizeWarning =
        'Image must be under 500 KB. Please compress and try again.';
      return;
    }
    this.avatarSizeWarning = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.pendingAvatarDataUrl = dataUrl;
      this.avatarPreviewUrl = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  removeAvatar(): void {
    this.pendingAvatarDataUrl = '';
    this.avatarPreviewUrl = null;
    this.avatarSizeWarning = '';
  }

  saveProfile(): void {
    const trimmedName = this.editDisplayName.trim();
    if (!trimmedName) {
      this.profileSaveError = 'Display name is required.';
      return;
    }
    if (trimmedName.length > 120) {
      this.profileSaveError = 'Display name cannot exceed 120 characters.';
      return;
    }

    this.isSavingProfile = true;
    this.profileSaveSuccess = '';
    this.profileSaveError = '';

    const dto: UpdateProfileDto = {
      displayName: trimmedName,
      timezone: this.editTimezone,
      locale: this.editLocale,
    };

    if (this.pendingAvatarDataUrl !== null) {
      dto.avatarUrl = this.pendingAvatarDataUrl;
    }

    this.authService.updateProfile(dto).subscribe({
      next: (res) => {
        this.isSavingProfile = false;
        this.profileSaveSuccess = 'Profile updated successfully!';
        this.pendingAvatarDataUrl = null;
        this.profileUpdated.emit(res);
        setTimeout(() => (this.profileSaveSuccess = ''), 3000);
      },
      error: (err) => {
        this.isSavingProfile = false;
        this.profileSaveError =
          err.error?.message || 'Failed to update profile. Please try again.';
      },
    });
  }

  get displayInitial(): string {
    const name = this.userDisplayName || this.userName || this.userEmail;
    return name ? name[0].toUpperCase() : '?';
  }
}
