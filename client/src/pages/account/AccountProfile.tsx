import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../../lib/api';
import { useAuth, useToast } from '../../context/StoreProvider';
import { Button, Input } from '../../components/ui';

export default function AccountProfile() {
  const { user, updateProfile } = useAuth();
  const { push } = useToast();

  const [profile, setProfile] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      await updateProfile({ name: profile.name, phone: profile.phone || null });
      push('Profile updated', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        setProfileErrors(err.fieldErrors);
        if (!Object.keys(err.fieldErrors).length) push(err.message, 'error');
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);

    if (passwords.next !== passwords.confirm) {
      setPasswordError('The new passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.next,
      });
      setPasswords({ current: '', next: '', confirm: '' });
      push('Password changed. Other devices have been signed out.', 'success');
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Could not change your password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="max-w-lg space-y-12">
      <section>
        <h2 className="mb-5 text-xs font-semibold uppercase tracking-architect">Your details</h2>
        <form onSubmit={handleProfile} className="space-y-5">
          <Input
            label="Full name" required value={profile.name} error={profileErrors.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
          />
          <Input
            label="Phone" type="tel" value={profile.phone} error={profileErrors.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
          <Input
            label="Email" value={user?.email ?? ''} disabled
            hint="Contact us if you need to change the email on your account."
          />
          <Button type="submit" loading={savingProfile}>
            Save changes
          </Button>
        </form>
      </section>

      <div className="rule" />

      <section>
        <h2 className="mb-5 text-xs font-semibold uppercase tracking-architect">Change password</h2>
        <form onSubmit={handlePassword} className="space-y-5">
          <Input
            label="Current password" type="password" required autoComplete="current-password"
            value={passwords.current}
            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
          />
          <Input
            label="New password" type="password" required autoComplete="new-password"
            hint="At least 8 characters" value={passwords.next}
            onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
          />
          <Input
            label="Confirm new password" type="password" required autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />

          {passwordError ? (
            <p className="border border-state-danger/30 bg-[#F9EDED] px-3 py-2.5 text-xs text-state-danger">
              {passwordError}
            </p>
          ) : null}

          <Button type="submit" variant="secondary" loading={savingPassword}>
            Change password
          </Button>
        </form>
      </section>
    </div>
  );
}
