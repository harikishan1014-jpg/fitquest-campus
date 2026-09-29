import type { AppState } from "../types";
const KEY = "fitquest-campus-v1";
export const initialState: AppState = {
  onboarded: false,
  profile: {
    name: "",
    goal: "Build healthy habits",
    experience: "Beginner",
    equipment: "No equipment",
    duration: 20,
    days: ["Mon", "Wed", "Fri"],
    language: "English",
  },
  xp: 0,
  coins: 0,
  streak: 0,
  longestStreak: 0,
  lastActive: "",
  activities: [],
  completedQuests: [],
  water: 0,
  mood: "",
  sound: false,
  activeSession: null,
};
export function loadState(): AppState {
  try {
    const value = localStorage.getItem(KEY);
    if (!value) return initialState;
    const saved = JSON.parse(value) as Partial<AppState>;
    return saved.onboarded ? { ...initialState, ...saved } : initialState;
  } catch {
    return initialState;
  }
}
export function saveState(state: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private browsing may disable storage */
  }
}
