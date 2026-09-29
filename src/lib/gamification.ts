import type { AppState, Activity } from "../types";
export const xpForNextLevel = (xp: number) => 500 - (xp % 500);
export const levelForXp = (xp: number) => Math.floor(xp / 500) + 1;
export function recordActivity(
  state: AppState,
  title: string,
  kind: string,
  minutes: number,
  xp: number,
  distanceKm?: number,
): AppState {
  const today = new Date().toLocaleDateString("en-CA");
  if (state.activities.some((a) => a.title === title && a.date === today))
    return state;
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const streak =
    state.lastActive === today
      ? state.streak
      : state.lastActive === yesterday
        ? state.streak + 1
        : 1;
  const activity: Activity = {
    id: crypto.randomUUID(),
    title,
    kind,
    date: today,
    minutes,
    xp,
    ...(distanceKm !== undefined ? { distanceKm } : {}),
  };
  return {
    ...state,
    xp: state.xp + xp,
    coins: state.coins + Math.ceil(xp / 8),
    streak,
    longestStreak: Math.max(streak, state.longestStreak),
    lastActive: today,
    activities: [activity, ...state.activities],
  };
}
