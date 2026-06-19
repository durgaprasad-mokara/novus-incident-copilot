import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Bell, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserSettings {
  display_name: string;
  timezone: string;
  theme: string;
}

interface NotificationPreferences {
  email_notifications_enabled: boolean;
  severity_threshold: string;
  channels_configured: string[];
}

export default function Settings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'general' | 'notifications'>('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    display_name: '',
    timezone: 'UTC',
    theme: 'light',
  });
  const [initialSettings, setInitialSettings] = useState<UserSettings>({
    display_name: '',
    timezone: 'UTC',
    theme: 'light',
  });

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    email_notifications_enabled: true,
    severity_threshold: 'medium',
    channels_configured: ['email'],
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      const loaded = {
        display_name: data.display_name || '',
        timezone: data.timezone || 'UTC',
        theme: data.theme || 'light',
      };
      setSettings(loaded);
      setInitialSettings(loaded);
      if (data.notification_preferences) {
        setNotifications(data.notification_preferences);
      }
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        display_name: settings.display_name,
        timezone: settings.timezone,
        theme: settings.theme,
      });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    const changedFields = Object.keys(settings).filter(
      (key) => settings[key as keyof UserSettings] !== initialSettings[key as keyof UserSettings]
    );

    // Pendo Track Event: settings_updated
    if (typeof pendo !== 'undefined') {
      pendo.track('settings_updated', {
        settings_section: 'general',
        fields_changed: changedFields.length,
        changed_field_names: changedFields.join(','),
      });
    }

    setInitialSettings({ ...settings });
    setSuccess('Settings saved successfully.');
    setLoading(false);
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        notification_preferences: notifications,
      });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Pendo Track Event: notification_preferences_updated
    if (typeof pendo !== 'undefined') {
      pendo.track('notification_preferences_updated', {
        email_notifications_enabled: notifications.email_notifications_enabled,
        severity_threshold: notifications.severity_threshold,
        channels_configured: notifications.channels_configured.join(','),
      });
    }

    setSuccess('Notification preferences saved.');
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/incidents')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'general'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <SettingsIcon className="h-4 w-4" /> General
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 pb-3 px-1 border-b-2 text-sm font-medium ${
              activeTab === 'notifications'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bell className="h-4 w-4" /> Notifications
          </button>
        </div>

        {activeTab === 'general' && (
          <form onSubmit={handleSaveSettings} className="bg-white shadow rounded-lg p-6 space-y-4">
            <div>
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={settings.display_name}
                onChange={(e) => setSettings({ ...settings, display_name: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              />
            </div>
            <div>
              <label htmlFor="timezone" className="block text-sm font-medium text-gray-700">
                Timezone
              </label>
              <select
                id="timezone"
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>
            <div>
              <label htmlFor="theme" className="block text-sm font-medium text-gray-700">
                Theme
              </label>
              <select
                id="theme"
                value={settings.theme}
                onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        )}

        {activeTab === 'notifications' && (
          <form onSubmit={handleSaveNotifications} className="bg-white shadow rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <input
                id="emailNotifications"
                type="checkbox"
                checked={notifications.email_notifications_enabled}
                onChange={(e) =>
                  setNotifications({ ...notifications, email_notifications_enabled: e.target.checked })
                }
                className="h-4 w-4 text-brand-500 border-gray-300 rounded focus:ring-brand-500"
              />
              <label htmlFor="emailNotifications" className="text-sm font-medium text-gray-700">
                Enable email notifications
              </label>
            </div>
            <div>
              <label htmlFor="severityThreshold" className="block text-sm font-medium text-gray-700">
                Minimum severity for notifications
              </label>
              <select
                id="severityThreshold"
                value={notifications.severity_threshold}
                onChange={(e) =>
                  setNotifications({ ...notifications, severity_threshold: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Notification Preferences'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
