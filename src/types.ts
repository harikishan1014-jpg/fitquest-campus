export type Activity = {
  id: string;
  title: string;
  kind: string;
  date: string;
  minutes: number;
  xp: number;
  distanceKm?: number;
};
export type Profile = {
  name: string;
  goal: string;
  experience: string;
  equipment: string;
  duration: number;
  days: string[];
  language: string;
};
export type AppState = {
  onboarded: boolean;
  profile: Profile;
  xp: number;
  coins: number;
  streak: number;
  longestStreak: number;
  lastActive: string;
  activities: Activity[];
  completedQuests: string[];
  water: number;
  mood: string;
  sound: boolean;
  activeSession: {
    id: string;
    step: number;
    seconds: number;
    paused: boolean;
    workout?: {
      id: string;
      name: string;
      category: string;
      time: number;
      level: string;
      focus: string;
      moves: string[];
      xp: number;
    };
  } | null;
};
