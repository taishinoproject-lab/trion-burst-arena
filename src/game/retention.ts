export const RETENTION_STORAGE_KEY = 'tba_retention_v1';
export const RETENTION_STORAGE_VERSION = 1;

export interface RetentionChallengeState {
  completed: boolean;
  bestValue?: number;
  completedAt?: number;
}

export interface RetentionCosmetics {
  unlockedTitles: string[];
  unlockedThemes: string[];
  selectedTitle?: string;
  selectedTheme?: string;
}

export interface RetentionData {
  version: number;
  bestTimes: Record<string, number>;
  challenges: Record<string, RetentionChallengeState>;
  cosmetics: RetentionCosmetics;
}

export interface TitlePreset {
  id: string;
  label: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  colorHex: string;
  colorNumber: number;
}

export type ChallengeId =
  | 'CH_NO_DAMAGE_CLEAR'
  | 'CH_RED_FORBIDDEN_CLEAR'
  | 'CH_SHIELD_BREAK_COUNT_3';

export interface ChallengeDefinition {
  id: ChallengeId;
  name: string;
  description: string;
  rewardTitleId?: string;
  rewardThemeId?: string;
}

export const TITLE_PRESETS: TitlePreset[] = [
  { id: 'title_rookie', label: '新人隊員' },
  { id: 'title_flawless', label: '無傷の達人' },
  { id: 'title_rulekeeper', label: '禁制ルール遵守者' },
  { id: 'title_shieldbreaker', label: '盾破り名人' },
];

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'theme_cyan', name: 'ネオシアン', colorHex: '#00ffd5', colorNumber: 0x00ffd5 },
  { id: 'theme_amber', name: 'アンバー', colorHex: '#ffd166', colorNumber: 0xffd166 },
  { id: 'theme_orchid', name: 'オーキッド', colorHex: '#c77dff', colorNumber: 0xc77dff },
  { id: 'theme_lime', name: 'ライム', colorHex: '#a3e635', colorNumber: 0xa3e635 },
];

export const DEFAULT_TITLE_ID = 'title_rookie';
export const DEFAULT_THEME_ID = 'theme_cyan';

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'CH_NO_DAMAGE_CLEAR',
    name: 'ノーダメージ撃破',
    description: '被弾せずにボスを撃破する',
    rewardTitleId: 'title_flawless',
    rewardThemeId: 'theme_orchid',
  },
  {
    id: 'CH_RED_FORBIDDEN_CLEAR',
    name: 'レッド禁制クリア',
    description: 'レッドを使わずにボスを撃破する',
    rewardTitleId: 'title_rulekeeper',
    rewardThemeId: 'theme_amber',
  },
  {
    id: 'CH_SHIELD_BREAK_COUNT_3',
    name: '盾破り x3',
    description: '1戦でシールドを3回破壊する',
    rewardTitleId: 'title_shieldbreaker',
    rewardThemeId: 'theme_lime',
  },
];

const getDefaultRetentionData = (): RetentionData => ({
  version: RETENTION_STORAGE_VERSION,
  bestTimes: {},
  challenges: {},
  cosmetics: {
    unlockedTitles: [DEFAULT_TITLE_ID],
    unlockedThemes: [DEFAULT_THEME_ID],
    selectedTitle: DEFAULT_TITLE_ID,
    selectedTheme: DEFAULT_THEME_ID,
  },
});

const normalizeStringArray = (value: unknown, allowed: Set<string>, fallback: string) => {
  if (!Array.isArray(value)) return [fallback];
  const filtered = value.filter((item): item is string => typeof item === 'string' && allowed.has(item));
  return filtered.length > 0 ? Array.from(new Set(filtered)) : [fallback];
};

const normalizeBestTimes = (value: unknown) => {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      result[key] = val;
    }
  });
  return result;
};

const normalizeChallenges = (value: unknown) => {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, RetentionChallengeState> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as RetentionChallengeState;
    const completed = Boolean(raw.completed);
    const bestValue =
      typeof raw.bestValue === 'number' && Number.isFinite(raw.bestValue) ? raw.bestValue : undefined;
    const completedAt =
      typeof raw.completedAt === 'number' && Number.isFinite(raw.completedAt) ? raw.completedAt : undefined;
    result[key] = {
      completed,
      ...(typeof bestValue === 'number' ? { bestValue } : {}),
      ...(typeof completedAt === 'number' ? { completedAt } : {}),
    };
  });
  return result;
};

const normalizeCosmetics = (value: unknown) => {
  const titleIds = new Set(TITLE_PRESETS.map((preset) => preset.id));
  const themeIds = new Set(THEME_PRESETS.map((preset) => preset.id));
  const fallbackTitle = DEFAULT_TITLE_ID;
  const fallbackTheme = DEFAULT_THEME_ID;
  const cosmetics = value && typeof value === 'object' ? (value as RetentionCosmetics) : undefined;
  const unlockedTitles = normalizeStringArray(cosmetics?.unlockedTitles, titleIds, fallbackTitle);
  const unlockedThemes = normalizeStringArray(cosmetics?.unlockedThemes, themeIds, fallbackTheme);
  const selectedTitle = unlockedTitles.includes(cosmetics?.selectedTitle ?? '') ? cosmetics?.selectedTitle : unlockedTitles[0];
  const selectedTheme = unlockedThemes.includes(cosmetics?.selectedTheme ?? '') ? cosmetics?.selectedTheme : unlockedThemes[0];
  return {
    unlockedTitles,
    unlockedThemes,
    selectedTitle,
    selectedTheme,
  };
};

export const loadRetentionData = (): RetentionData => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return getDefaultRetentionData();
  }
  try {
    const raw = window.localStorage.getItem(RETENTION_STORAGE_KEY);
    if (!raw) return getDefaultRetentionData();
    const parsed = JSON.parse(raw) as Partial<RetentionData>;
    if (!parsed || typeof parsed !== 'object') {
      return getDefaultRetentionData();
    }
    const bestTimes = normalizeBestTimes(parsed.bestTimes);
    const challenges = normalizeChallenges(parsed.challenges);
    const cosmetics = normalizeCosmetics(parsed.cosmetics);
    return {
      version: RETENTION_STORAGE_VERSION,
      bestTimes,
      challenges,
      cosmetics,
    };
  } catch (error) {
    return getDefaultRetentionData();
  }
};

export const saveRetentionData = (data: RetentionData) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(RETENTION_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    return;
  }
};

export const resetRetentionData = () => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(RETENTION_STORAGE_KEY);
  } catch (error) {
    return;
  }
};
