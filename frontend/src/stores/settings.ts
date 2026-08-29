import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ReplyStyle = 'cute' | 'cool' | 'tease' | 'warm';
export type FontSize = 'small' | 'medium' | 'large';
export type CompanionshipMode = 'off' | 'gentle' | 'normal';
export type ThemeId = 'white' | 'paper' | 'mist' | 'cinnabar';

export interface AppSettings {
  intimacy: number;
  backgroundImage: string | null;
  theme: ThemeId;
  ttsSpeed: number;
  replyStyle: ReplyStyle;
  notificationsEnabled: boolean;
  fontSize: FontSize;
  autoMemory: boolean;
  companionship: CompanionshipMode;
}

interface SettingsStore extends AppSettings {
  updateSettings: (settings: Partial<AppSettings>) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  intimacy: 60,
  backgroundImage: null,
  theme: 'white',
  ttsSpeed: 1,
  replyStyle: 'cute',
  notificationsEnabled: false,
  fontSize: 'medium',
  autoMemory: true,
  companionship: 'normal',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (settings) => set(settings),
    }),
    {
      name: 'soulemate-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        intimacy: state.intimacy,
        backgroundImage: state.backgroundImage,
        theme: state.theme,
        ttsSpeed: state.ttsSpeed,
        replyStyle: state.replyStyle,
        notificationsEnabled: state.notificationsEnabled,
        fontSize: state.fontSize,
        autoMemory: state.autoMemory,
        companionship: state.companionship,
      }),
    },
  ),
);

/** 主题元信息（供 UI 展示） */
export const THEMES: { id: ThemeId; label: string; desc: string }[] = [
  { id: 'white', label: '素白留白', desc: '纯白底 · 水墨灰阶' },
  { id: 'paper', label: '暖灰宣纸', desc: '米灰底 · 墨青点缀' },
  { id: 'mist', label: '黛青烟雨', desc: '青灰底 · 淡黛深情' },
  { id: 'cinnabar', label: '朱砂点睛', desc: '米白底 · 朱砂落款' },
];