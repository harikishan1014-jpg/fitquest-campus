import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  Home,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sprout,
  Target,
  UsersRound,
  UserRound,
  Waves,
  X,
  Zap,
} from "lucide-react";
import type { AppState } from "./types";
import { initialState, loadState, saveState } from "./lib/storage";
import { levelForXp, recordActivity, xpForNextLevel } from "./lib/gamification";
import { acceptedWalkingSegment } from "./lib/walkTracking";
import { supabaseConfigured } from "./lib/supabaseConfig";
import { exerciseLibrary, instructionsForExercise, poses, quests, workouts, type Workout } from "./data";
import "leaflet/dist/leaflet.css";

const CommunityPage = lazy(() => import("./components/CommunityPage").then((module) => ({ default: module.CommunityPage })));
const WorkoutCamera = lazy(() => import("./components/WorkoutCamera").then((module) => ({ default: module.WorkoutCamera })));
const ExerciseModel3D = lazy(() => import("./components/ExerciseModel3D"));
const LiveWalkMap = lazy(() => import("./components/LiveWalkMap"));

type Page =
  | "Overview"
  | "Workouts"
  | "Quests"
  | "Community"
  | "Walk"
  | "Yoga"
  | "Progress"
  | "Guide"
  | "Coach"
  | "Profile"
  | "Settings";
type ThemeMode = "light" | "dark" | "system";
function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("fitquest-theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {}
  return "system";
}
function readWorkoutSession() {
  try {
    return JSON.parse(
      localStorage.getItem("fitquest-active-session") || "null",
    );
  } catch {
    return null;
  }
}
function restoredWorkout(): Workout | null {
  const session = readWorkoutSession();
  return workouts.find((item) => item.id === session?.id) || session?.workout || null;
}
const nav: { label: Page; icon: typeof Home; group: string }[] = [
  { label: "Overview", icon: Home, group: "YOUR SPACE" },
  { label: "Workouts", icon: Dumbbell, group: "YOUR SPACE" },
  { label: "Quests", icon: Compass, group: "YOUR SPACE" },
  { label: "Community", icon: UsersRound, group: "YOUR SPACE" },
  { label: "Walk", icon: Footprints, group: "MOVE" },
  { label: "Yoga", icon: Waves, group: "MOVE" },
  { label: "Progress", icon: ActivityIcon, group: "GROW" },
  { label: "Guide", icon: BookOpen, group: "GROW" },
  { label: "Coach", icon: MessageCircle, group: "GROW" },
];
function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const resolvedTheme = themeMode === "system" ? (systemDark ? "dark" : "light") : themeMode;
  const [page, setPage] = useState<Page>("Overview");
  const [toast, setToast] = useState("");
  const [workout, setWorkout] = useState<Workout | null>(
    restoredWorkout,
  );
  const [step, setStep] = useState(() => readWorkoutSession()?.step || 0);
  const [seconds, setSeconds] = useState(
    () => readWorkoutSession()?.seconds || 0,
  );
  const [paused, setPaused] = useState(
    () => readWorkoutSession()?.paused ?? false,
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [walk, setWalk] = useState(false);
  const [walkSeconds, setWalkSeconds] = useState(0);
  const [distance, setDistance] = useState(0);
  const [walkSpeed, setWalkSpeed] = useState(0);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [walkError, setWalkError] = useState("");
  const [manual, setManual] = useState(true);
  const [profileEdit, setProfileEdit] = useState(false);
  const [poseCamera, setPoseCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [selectedPose, setSelectedPose] = useState(poses[0]);
  const [yogaSeconds, setYogaSeconds] = useState(60);
  const [yogaOn, setYogaOn] = useState(false);
  const [chat, setChat] = useState<{ from: "coach" | "you"; text: string }[]>([
    {
      from: "coach",
      text: "What would feel good for your body today? I can help you find a quick workout, make a plan, or build a habit that sticks.",
    },
  ]);
  const [message, setMessage] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const lastGpsRef = useRef<{ lat: number; lon: number; at: number } | null>(
    null,
  );
  const processedActivityRef = useRef(new Set<string>());
  const questClaimRef = useRef(new Set<string>());
  useEffect(() => saveState(state), [state]);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => setSystemDark(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    try { localStorage.setItem("fitquest-theme", themeMode); } catch {}
  }, [resolvedTheme, themeMode]);
  useEffect(() => {
    const activeSession = workout
      ? { id: workout.id, step, seconds, paused, workout }
      : null;
    try {
      if (activeSession)
        localStorage.setItem(
          "fitquest-active-session",
          JSON.stringify(activeSession),
        );
      else localStorage.removeItem("fitquest-active-session");
    } catch {}
    if (JSON.stringify(state.activeSession) !== JSON.stringify(activeSession))
      setState((s) => ({ ...s, activeSession }));
  }, [workout, step, seconds, paused, state.activeSession]);
  useEffect(() => {
    if (workout && !paused) {
      const i = setInterval(() => setSeconds((s: number) => s + 1), 1000);
      return () => clearInterval(i);
    }
  }, [workout, paused]);
  useEffect(() => {
    if (walk) {
      const i = setInterval(() => setWalkSeconds((s: number) => s + 1), 1000);
      return () => clearInterval(i);
    }
  }, [walk]);
  useEffect(() => {
    if (yogaOn) {
      const i = setInterval(
        () => setYogaSeconds((s: number) => Math.max(0, s - 1)),
        1000,
      );
      return () => clearInterval(i);
    }
  }, [yogaOn]);
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (gpsWatchRef.current !== null)
        navigator.geolocation?.clearWatch(gpsWatchRef.current);
    },
    [],
  );
  const notify = useCallback((s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(""), 2600);
  }, []);
  const commit = (next: AppState) => {
    setState(next);
  };
  const beginWorkout = (w: Workout) => {
    const session = { id: w.id, step: 0, seconds: 0, paused: false, workout: w };
    try {
      localStorage.setItem("fitquest-active-session", JSON.stringify(session));
    } catch {}
    setStep(0);
    setSeconds(0);
    setPaused(false);
    setWorkout(w);
  };
  const finishActivity = useCallback(
    (title: string, kind: string, mins: number, xp: number, distanceKm?: number) => {
      const date = new Date().toLocaleDateString("en-CA");
      const key = `${date}:${kind}:${title}`;
      if (
        processedActivityRef.current.has(key) ||
        state.activities.some((a) => a.title === title && a.date === date)
      ) {
        notify("This activity is already in today’s log.");
        return;
      }
      processedActivityRef.current.add(key);
      const next = recordActivity(state, title, kind, mins, xp, distanceKm);
      if (next === state) {
        notify("This activity is already in today’s log.");
        return;
      }
      setState(next);
      notify(`Activity saved · +${xp} XP · +${Math.ceil(xp / 8)} coins`);
    },
    [state, notify],
  );
  useEffect(() => {
    if (yogaSeconds === 0 && yogaOn) {
      setYogaOn(false);
      finishActivity(`${selectedPose.name} yoga`, "Yoga", 1, 35);
    }
  }, [yogaSeconds, yogaOn, selectedPose.name, finishActivity]);
  const completeQuest = (id: string) => {
    if (state.completedQuests.includes(id) || questClaimRef.current.has(id)) {
      notify("Quest already claimed.");
      return;
    }
    questClaimRef.current.add(id);
    const q = quests.find((x) => x.id === id)!;
    const completed = [...state.completedQuests, id];
    commit({
      ...state,
      xp: state.xp + q.reward,
      coins: state.coins + q.coins,
      completedQuests: completed,
    });
    notify(`Quest complete · +${q.reward} XP · +${q.coins} coins`);
  };
  const completedWorkout = () => {
    if (!workout) return;
    finishActivity(
      workout.name,
      "Workout",
      Math.max(1, Math.round(seconds / 60)),
      workout.xp,
    );
    try {
      localStorage.removeItem("fitquest-active-session");
    } catch {}
    setWorkout(null);
    setSeconds(0);
    setStep(0);
    setPaused(false);
  };
  const dayLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const today = new Date().toLocaleDateString("en-CA");
  const todaysActivities = state.activities.filter((a) => a.date === today);
  const dailyWalkMinutes = todaysActivities
    .filter((activity) => activity.kind === "Walk")
    .reduce((total, activity) => total + activity.minutes, 0);
  const level = levelForXp(state.xp);
  const progress = (state.xp % 500) / 5;
  const weekly = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(
          Date.now() - (6 - i) * 86400000,
        ).toLocaleDateString("en-CA");
        return {
          label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(
            new Date(Date.now() - (6 - i) * 86400000),
          ),
          value: state.activities
            .filter((a) => a.date === date)
            .reduce((n, a) => n + a.minutes, 0),
        };
      }),
    [state.activities],
  );
  const goto = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    setPoseCamera(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  const beginCamera = async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser.");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = s;
      setPoseCamera(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = s;
      }, 0);
    } catch (e) {
      setCameraError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera permission was denied. You can still use the movement guide."
          : "Could not start the camera. Check that it is connected and try again.",
      );
    }
  };
  const startWalk = () => {
    setWalkSeconds(0);
    setDistance(0);
    setWalkSpeed(0);
    setRoute([]);
    setGpsAccuracy(null);
    setWalkError("");
    lastGpsRef.current = null;
    if (!manual) {
      if (!navigator.geolocation) {
        notify("GPS is unavailable. Switch to manual mode.");
        return;
      }
      setWalk(true);
      setWalkError("Waiting for a GPS fix. Keep this screen open and move to an open area.");
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        (next) => {
          setGpsAccuracy(next.coords.accuracy);
          // Allow the normal 5–30 m outdoor accuracy range; very poor fixes stay visible but are not mapped.
          if (next.coords.accuracy > 65) {
            setWalkError("GPS signal is weak. Move to an open area; tracking will continue when accuracy improves.");
            return;
          }
          const current = {
            lat: next.coords.latitude,
            lon: next.coords.longitude,
            at: next.timestamp,
          };
          const prev = lastGpsRef.current;
          if (!prev) {
            lastGpsRef.current = current;
            setRoute([[current.lat, current.lon]]);
            setWalkError("");
            notify("GPS acquired. Your live route is ready.");
            return;
          }
          const meters = acceptedWalkingSegment(prev, current, next.coords.accuracy);
          if (meters !== null) {
            setDistance((d) => d + meters / 1000);
            setWalkSpeed(meters / ((current.at - prev.at) / 1000));
            lastGpsRef.current = current;
            setRoute((points) => [...points, [current.lat, current.lon]]);
          }
        },
        (error) => {
          const message = error.code === error.PERMISSION_DENIED
            ? "Location permission was denied or revoked. Allow location in browser settings to use GPS."
            : error.code === error.TIMEOUT
              ? "Still waiting for a GPS fix. Tracking will start as soon as a usable position arrives."
              : "GPS signal is temporarily unavailable. Move to an open area to reconnect.";
          setWalkError(message);
          if (error.code === error.PERMISSION_DENIED) {
            setWalk(false);
            if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
            gpsWatchRef.current = null;
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
      );
    } else setWalk(true);
  };
  const endWalk = () => {
    setWalk(false);
    if (gpsWatchRef.current !== null) {
      navigator.geolocation?.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
    lastGpsRef.current = null;
    const mins = Math.max(1, Math.round(walkSeconds / 60));
    const distanceText = distance > 0 ? ` · ${distance.toFixed(1)} km` : "";
    finishActivity(
      `${manual ? "Manual" : "GPS"} walk${distanceText}`,
      "Walk",
      mins,
      Math.min(120, Math.max(25, mins * 4)),
      manual ? undefined : distance,
    );
    setWalkSeconds(0);
    notify("Walk saved. Your effort counts.");
  };
  const addWater = () => {
    const n = Math.min(12, state.water + 1);
    commit({ ...state, water: n });
    notify(
      n >= 5
        ? "Hydration quest complete. Claim your reward in Quests."
        : "Water logged.",
    );
  };
  const sendMessage = () => {
    if (!message.trim()) return;
    const text = message.trim();
    setChat((c) => [
      ...c,
      { from: "you", text },
      {
        from: "coach",
        text:
          text.toLowerCase().includes("pain") ||
          text.toLowerCase().includes("injur")
            ? "I’m sorry you’re dealing with that. I can’t assess injuries. Please check with a qualified health professional before exercising."
            : "Try a small step that fits your energy today: 10 minutes of gentle mobility, an easy walk, or a short strength circuit. Want me to help you pick one?",
      },
    ]);
    setMessage("");
  };
  const label =
    page === "Overview"
      ? "Your day, your pace."
      : page === "Workouts"
        ? "Find your next move."
        : page === "Progress"
          ? "Small steps add up."
          : page === "Quests"
            ? "A little challenge, a lot of momentum."
            : page === "Walk"
              ? "Take fitness outside."
              : page === "Yoga"
                ? "Create a little room to breathe."
                : page === "Guide"
                  ? "Move with confidence."
                  : page === "Coach"
                    ? "A coach in your corner."
                    : page === "Profile"
                      ? "Your journey, your way."
                      : "Make it work for you.";
  if (!state.onboarded)
    return (
      <Onboarding
        finish={(profile) => {
          commit({ ...state, onboarded: true, profile });
        }}
      />
    );
  return (
    <div className="app-shell" data-theme={resolvedTheme}>
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <button className="brand" onClick={() => goto("Overview")}>
          <span className="brand-mark">
            <Sprout size={20} />
          </span>
          <span>
            fitquest<span className="brand-campus">CAMPUS</span>
          </span>
        </button>
        <div className="side-profile">
          <div className="avatar">
            {state.profile.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{state.profile.name}</strong>
            <span>
              Level {level} ·{" "}
              {level < 3
                ? "Getting started"
                : level < 6
                  ? "Building momentum"
                  : "Consistent"}
            </span>
          </div>
          <button
            className="icon-button tiny"
            aria-label="Profile options"
            onClick={() => goto("Profile")}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        <nav>
          {["YOUR SPACE", "MOVE", "GROW"].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-caption">{group}</div>
              {nav
                .filter((n) => n.group === group)
                .map((n) => (
                  <button
                    className={`nav-link ${page === n.label ? "active" : ""}`}
                    onClick={() => goto(n.label)}
                    key={n.label}
                  >
                    <n.icon size={18} />
                    <span>{n.label}</span>
                    {n.label === "Quests" && (
                      <span className="nav-count">
                        {quests.length - state.completedQuests.length}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-quote">
            <span className="quote-icon">✳</span>
            <p>Progress isn’t always loud. Showing up is enough.</p>
          </div>
          <button
            className={`nav-link ${page === "Settings" ? "active" : ""}`}
            onClick={() => goto("Settings")}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <div className="side-foot">
            MADE FOR REAL LIFE <span>v1.0</span>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMobileNav(!mobileNav)}
            aria-label="Toggle navigation"
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>FITQUEST</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <div className="top-streak">
              <Flame size={16} />
              <b>{state.streak}</b>
              <span>day streak</span>
            </div>
            <span className="top-divider" />
            <button className="coin-pill" onClick={() => goto("Profile")}>
              <span>✦</span>
              {state.coins}
            </button>
            <button
              className="avatar avatar-top"
              onClick={() => goto("Profile")}
              aria-label="Open profile"
            >
              {state.profile.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="date-eyebrow">
                {page === "Overview"
                  ? dayLabel.toUpperCase()
                  : "FITQUEST / " + page.toUpperCase()}
              </div>
              <h1>{label}</h1>
            </div>
            {page === "Overview" && (
              <button
                className="button button-primary"
                onClick={() => goto("Workouts")}
              >
                <Play size={15} fill="currentColor" /> Start a workout
              </button>
            )}
            {page === "Profile" && (
              <button
                className="button button-outline"
                onClick={() => setProfileEdit(!profileEdit)}
              >
                {profileEdit ? "Done" : "Edit profile"}
              </button>
            )}
          </div>
          {page === "Overview" && (
            <>
              <section className="welcome-band">
                <div className="welcome-copy">
                  <div className="micro-label">
                    <span className="live-dot" /> YOUR CAMPUS JOURNEY
                  </div>
                  <h2>
                    Hey {state.profile.name.split(" ")[0]},<br />
                    you’re building something good.
                  </h2>
                  <p>Every little effort counts. What feels right today?</p>
                  <button
                    className="button button-light"
                    onClick={() => goto("Workouts")}
                  >
                    Find your next move <ArrowRight size={16} />
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <div className="orb orb-one" />
                  <div className="orb orb-two" />
                  <div className="art-sun" />
                  <div className="art-path" />
                  <div className="art-figure">
                    <div className="figure-head" />
                    <div className="figure-body" />
                    <div className="figure-arm arm-left" />
                    <div className="figure-arm arm-right" />
                    <div className="figure-leg leg-left" />
                    <div className="figure-leg leg-right" />
                  </div>
                  <span className="art-spark spark-a">✳</span>
                  <span className="art-spark spark-b">✦</span>
                  <span className="art-note">
                    A fresh start
                    <br />
                    is always yours.
                  </span>
                </div>
                <div className="welcome-index">
                  <span>01</span>
                  <span className="index-line" />
                  <span>YOUR DAY</span>
                </div>
              </section>
              <section className="stats-row">
                <Stat
                  icon={Zap}
                  name="LEVEL"
                  value={String(level).padStart(2, "0")}
                  foot={`${state.xp} total XP`}
                  color="coral"
                />
                <Stat
                  icon={Flame}
                  name="STREAK"
                  value={`${state.streak} ${state.streak === 1 ? "day" : "days"}`}
                  foot={`Best · ${state.longestStreak} ${state.longestStreak === 1 ? "day" : "days"}`}
                  color="orange"
                />
                <Stat
                  icon={Target}
                  name="THIS WEEK"
                  value={`${weekly.reduce((a, d) => a + d.value, 0)} min`}
                  foot="Movement that adds up"
                  color="green"
                />
                <Stat
                  icon={Award}
                  name="COINS"
                  value={String(state.coins)}
                  foot="Earned through effort"
                  color="blue"
                />
              </section>
              <div className="overview-grid">
                <section className="panel today-panel">
                  <div className="panel-head">
                    <div>
                      <div className="section-kicker">YOUR PLAN</div>
                      <h3>Today at a glance</h3>
                    </div>
                    <button
                      className="text-link"
                      onClick={() => goto("Quests")}
                    >
                      All quests <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="today-row">
                    <div className="today-icon coral-soft">
                      <Dumbbell size={18} />
                    </div>
                    <div className="today-detail">
                      <strong>
                        {todaysActivities.find((a) => a.kind === "Workout")
                          ?.title || "Your next movement"}
                      </strong>
                      <span>
                        {todaysActivities.some((a) => a.kind === "Workout")
                          ? "Completed today · nice work"
                          : "Choose a routine that fits today"}
                      </span>
                    </div>
                    <button
                      className="round-arrow"
                      onClick={() =>
                        todaysActivities.some((a) => a.kind === "Workout")
                          ? goto("Progress")
                          : beginWorkout(workouts[0])
                      }
                    >
                      {todaysActivities.some((a) => a.kind === "Workout") ? (
                        <Check size={17} />
                      ) : (
                        <ArrowRight size={17} />
                      )}
                    </button>
                  </div>
                  <div className="divider" />
                  <div className="subsection-line">
                    <span>DAILY QUESTS</span>
                    <span>
                      {state.completedQuests.length}/{quests.length} done
                    </span>
                  </div>
                  {quests.slice(0, 3).map((q) => (
                    <div className="quest-line" key={q.id}>
                      <div
                        className={`quest-check ${state.completedQuests.includes(q.id) ? "checked" : ""}`}
                      >
                        {state.completedQuests.includes(q.id) ? (
                          <Check size={12} />
                        ) : (
                          q.icon
                        )}
                      </div>
                      <div className="quest-line-content">
                        <strong>{q.name}</strong>
                        <span>{q.description}</span>
                      </div>
                      <span className="quest-xp">+{q.reward} XP</span>
                      {state.completedQuests.includes(q.id) ? (
                        <span className="done-label">DONE</span>
                      ) : (
                        <button
                          className="claim-mini"
                          onClick={() =>
                            q.id === "water"
                              ? state.water >= 5
                                ? completeQuest(q.id)
                                : goto("Quests")
                              : q.id === "walk"
                                ? goto("Walk")
                                : q.id === "move"
                                  ? goto("Workouts")
                                  : goto("Yoga")
                          }
                        >
                          {q.id === "water" && state.water < 5 ? "LOG" : "GO"}{" "}
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </section>
                <section className="panel progress-panel">
                  <div className="panel-head">
                    <div>
                      <div className="section-kicker">YOUR MOMENTUM</div>
                      <h3>Level {level} progress</h3>
                    </div>
                    <div className="level-seal">
                      <span>{level}</span>
                      <small>LVL</small>
                    </div>
                  </div>
                  <div className="level-copy">
                    <span>{state.xp % 500} XP earned</span>
                    <b>
                      {xpForNextLevel(state.xp)} XP to level {level + 1}
                    </b>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <div className="level-footer">
                    <span>Level {level}</span>
                    <span>Level {level + 1}</span>
                  </div>
                  <div className="character-row">
                    <div className="character-sprout">
                      <Sprout size={27} />
                      <span>✦</span>
                    </div>
                    <div>
                      <div className="section-kicker">YOUR CHARACTER</div>
                      <strong>
                        {level < 2
                          ? "The Seedling"
                          : level < 4
                            ? "Finding Your Feet"
                            : level < 7
                              ? "Momentum Maker"
                              : "The Steady One"}
                      </strong>
                      <p>Grows with your consistency, not intensity.</p>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => goto("Progress")}
                      aria-label="Character milestones"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="divider" />
                  <div className="weekly-title">
                    <strong>This week</strong>
                    <button
                      className="text-link"
                      onClick={() => goto("Progress")}
                    >
                      Details <ArrowRight size={13} />
                    </button>
                  </div>
                  <div className="week-chart">
                    {weekly.map((d, i) => (
                      <div className="week-bar-col" key={i}>
                        <div className="week-bar-area">
                          <div
                            className={`week-bar ${d.value ? "filled" : ""} ${d.value > 25 ? "tall" : ""}`}
                            style={{
                              height: `${Math.max(8, Math.min(100, d.value * 3))}%`,
                            }}
                          >
                            {d.value > 0 && <i />}
                          </div>
                        </div>
                        <span>{d.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="quick-section">
                <div className="quick-heading">
                  <div>
                    <div className="section-kicker">MAKE IT YOURS</div>
                    <h3>Pick up where you are</h3>
                  </div>
                  <span className="soft-note">No perfect day required.</span>
                </div>
                <div className="quick-links">
                  <Quick
                    icon={Dumbbell}
                    label="Workout"
                    sub="Move a little"
                    onClick={() => goto("Workouts")}
                    tint="coral"
                  />
                  <Quick
                    icon={Footprints}
                    label="Campus walk"
                    sub="Get some air"
                    onClick={() => goto("Walk")}
                    tint="blue"
                  />
                  <Quick
                    icon={Waves}
                    label="Yoga"
                    sub="Find your breath"
                    onClick={() => goto("Yoga")}
                    tint="green"
                  />
                  <Quick
                    icon={MessageCircle}
                    label="Ask your coach"
                    sub="Talk it through"
                    onClick={() => goto("Coach")}
                    tint="lavender"
                  />
                </div>
              </section>
            </>
          )}
          {page === "Workouts" && (
            <WorkoutsView
              search={search}
              setSearch={setSearch}
              filter={filter}
              setFilter={setFilter}
              onStart={beginWorkout}
              activities={todaysActivities}
            />
          )}
          {page === "Quests" && (
            <QuestsView
              state={state}
              complete={completeQuest}
              setPage={goto}
              addWater={addWater}
              walkMinutes={dailyWalkMinutes}
            />
          )}
          {page === "Community" && <Suspense fallback={<div role="status">Loading community…</div>}><CommunityPage profileName={state.profile.name} /></Suspense>}
          {page === "Walk" && (
            <WalkView
              walk={walk}
              manual={manual}
              setManual={setManual}
              start={startWalk}
              end={endWalk}
              seconds={walkSeconds}
              distance={distance}
              setDistance={setDistance}
              speed={walkSpeed}
              route={route}
              gpsAccuracy={gpsAccuracy}
              walkError={walkError}
              setPage={goto}
            />
          )}
          {page === "Yoga" && (
            <YogaView
              selected={selectedPose}
              setSelected={(p) => {
                setSelectedPose(p);
                setYogaSeconds(60);
              }}
              seconds={yogaSeconds}
              running={yogaOn}
              toggle={() => setYogaOn(!yogaOn)}
              finish={() => {
                setYogaOn(false);
                finishActivity(`${selectedPose.name} yoga`, "Yoga", 1, 35);
              }}
            />
          )}
          {page === "Progress" && (
            <ProgressView state={state} weekly={weekly} />
          )}
          {page === "Guide" && (
            <GuideView
              startCamera={beginCamera}
              camera={poseCamera}
              error={cameraError}
              videoRef={videoRef}
              sound={state.sound}
              toggleSound={() => commit({ ...state, sound: !state.sound })}
            />
          )}
          {page === "Coach" && (
            <CoachView
              chat={chat}
              message={message}
              setMessage={setMessage}
              send={sendMessage}
              goal={state.profile.goal}
              experience={state.profile.experience}
              activityCount={state.activities.length}
            />
          )}
          {page === "Profile" && (
            <ProfileView
              state={state}
              edit={profileEdit}
              save={(p) => {
                commit({ ...state, profile: { ...state.profile, ...p } });
                setProfileEdit(false);
                notify("Profile saved on this device.");
              }}
            />
          )}
          {page === "Settings" && (
            <SettingsView
              state={state}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              update={(p) => commit({ ...state, ...p })}
              reset={() => {
                localStorage.removeItem("fitquest-campus-v1");
                localStorage.removeItem("fitquest-active-session");
                setState(initialState);
                setPage("Overview");
                notify("Local activity history cleared.");
              }}
            />
          )}
        </div>
      </main>
      {workout && (
        <WorkoutModal
          workout={workout}
          step={step}
          setStep={setStep}
          seconds={seconds}
          paused={paused}
          setPaused={setPaused}
          finish={completedWorkout}
          close={() => {
            try {
              localStorage.removeItem("fitquest-active-session");
            } catch {}
            setWorkout(null);
            setPaused(false);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {mobileNav && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
    </div>
  );
}
function Stat({
  icon: Icon,
  name,
  value,
  foot,
  color,
}: {
  icon: typeof Zap;
  name: string;
  value: string;
  foot: string;
  color: string;
}) {
  return (
    <div className="stat">
      <div className={`stat-icon ${color}`}>
        <Icon size={17} />
      </div>
      <div className="stat-name">{name}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">{foot}</div>
    </div>
  );
}
function Onboarding({ finish }: { finish: (p: AppState["profile"]) => void }) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<AppState["profile"]>({
    name: "",
    goal: "Build healthy habits",
    experience: "Beginner",
    equipment: "No equipment",
    duration: 20,
    days: ["Mon", "Wed", "Fri"],
    language: "English",
  });
  const [error, setError] = useState("");
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const goals = [
    "General fitness",
    "Build strength",
    "Improve flexibility",
    "Improve stamina",
    "Build healthy habits",
  ];
  return (
    <main className="onboarding-screen">
      <div className="onboard-top">
        <button className="brand" onClick={() => setStep(0)}>
          <span className="brand-mark">
            <Sprout size={20} />
          </span>
          <span>
            fitquest<span className="brand-campus">CAMPUS</span>
          </span>
        </button>
        <span>YOUR START, YOUR WAY</span>
      </div>
      <section className="onboard-card">
        <div className="onboard-art">
          <span>✳</span>
          <div className="onboard-plant">
            <Sprout size={70} />
          </div>
          <p>
            Fitness that
            <br />
            fits real life.
          </p>
          <small>SMALL STEPS COUNT</small>
        </div>
        <div className="onboard-form">
          <div className="section-kicker">
            LET’S GET TO KNOW YOU · {step + 1} OF 3
          </div>
          <div className="onboard-progress">
            <i style={{ width: `${(step + 1) * 33.33}%` }} />
          </div>
          {step === 0 ? (
            <>
              <h1>
                Start with what
                <br />
                feels like you.
              </h1>
              <p>
                A few details help us make FITQUEST feel more personal. Your
                body stats are optional.
              </p>
              <Field label="What should we call you?">
                <input
                  autoFocus
                  maxLength={40}
                  placeholder="Your name"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </Field>
              <div className="field">
                <span>What are you working toward?</span>
                <div className="choice-grid">
                  {goals.map((g) => (
                    <button
                      type="button"
                      key={g}
                      className={`choice ${profile.goal === g ? "choice-active" : ""}`}
                      onClick={() => setProfile({ ...profile, goal: g })}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <h1>
                Make it fit
                <br />
                your day.
              </h1>
              <p>
                There’s no wrong place to start. You can update these
                preferences anytime.
              </p>
              <div className="field">
                <span>How would you describe your experience?</span>
                <div className="choice-row">
                  {["Beginner", "Intermediate", "Advanced"].map((x) => (
                    <button
                      type="button"
                      key={x}
                      className={`choice ${profile.experience === x ? "choice-active" : ""}`}
                      onClick={() => setProfile({ ...profile, experience: x })}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Equipment you have">
                <select
                  value={profile.equipment}
                  onChange={(e) =>
                    setProfile({ ...profile, equipment: e.target.value })
                  }
                >
                  {["No equipment", "Basic equipment", "Full gym"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred session length">
                <select
                  value={profile.duration}
                  onChange={(e) =>
                    setProfile({ ...profile, duration: Number(e.target.value) })
                  }
                >
                  {[5, 10, 20, 30, 45].map((x) => (
                    <option value={x} key={x}>
                      {x === 45 ? "45+" : x} minutes
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <>
              <h1>
                Choose your
                <br />
                own rhythm.
              </h1>
              <p>
                Pick a few days that usually work. This is a gentle guide, not a
                commitment.
              </p>
              <div className="field">
                <span>Days you might like to move</span>
                <div className="day-choices">
                  {days.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className={profile.days.includes(d) ? "day-selected" : ""}
                      onClick={() =>
                        setProfile({
                          ...profile,
                          days: profile.days.includes(d)
                            ? profile.days.filter((x) => x !== d)
                            : [...profile.days, d],
                        })
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Preferred language">
                <select
                  value={profile.language}
                  onChange={(e) =>
                    setProfile({ ...profile, language: e.target.value })
                  }
                >
                  {["English", "Hindi", "Kannada"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <div className="local-note">
                <ShieldCheck size={15} /> This profile is saved on this device.
                {supabaseConfigured ? " Sign in under Community to sync friend invites." : " Configure Supabase to enable account-based friend invites."}
              </div>
            </>
          )}
          {error && (
            <p className="onboard-error" role="alert">
              {error}
            </p>
          )}
          <div className="onboard-actions">
            {step > 0 && (
              <button
                className="button button-outline"
                onClick={() => {
                  setStep(step - 1);
                  setError("");
                }}
              >
                <ChevronLeft size={15} /> Back
              </button>
            )}
            <button
              className="button button-primary"
              onClick={() => {
                if (step === 0 && !profile.name.trim()) {
                  setError("Enter a name to continue.");
                  return;
                }
                if (step < 2) {
                  setError("");
                  setStep(step + 1);
                } else finish(profile);
              }}
            >
              {step === 2 ? "Start my journey" : "Continue"}{" "}
              <ArrowRight size={15} />
            </button>
          </div>
          <span className="optional-note">
            No age or body measurements needed to get started.
          </span>
        </div>
      </section>
      <footer className="onboard-footer">
        FITQUEST CAMPUS <span>MOVE AT YOUR OWN PACE</span>
      </footer>
    </main>
  );
}
function Quick({
  icon: Icon,
  label,
  sub,
  onClick,
  tint,
}: {
  icon: typeof Zap;
  label: string;
  sub: string;
  onClick: () => void;
  tint: string;
}) {
  return (
    <button className="quick-link" onClick={onClick}>
      <span className={`quick-icon ${tint}`}>
        <Icon size={18} />
      </span>
      <span className="quick-text">
        <strong>{label}</strong>
        <small>{sub}</small>
      </span>
      <ArrowUpRight className="quick-arrow" size={16} />
    </button>
  );
}
function WorkoutsView({
  search,
  setSearch,
  filter,
  setFilter,
  onStart,
  activities,
}: {
  search: string;
  setSearch: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
  onStart: (w: Workout) => void;
  activities: AppState["activities"];
}) {
  const categories = [
    "All",
    "Beginner",
    "Quick workout",
    "Full body",
    "Mobility",
    "Legs",
    "Chest",
    "Core",
    "Upper body",
    "Mobility / yoga",
  ];
  const shown = workouts.filter(
    (w) =>
      (filter === "All" || w.category === filter || w.level === filter) &&
      w.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="search-row">
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workouts or focus areas"
          />
        </label>
      </div>
      <div className="filter-row">
        {categories.map((c) => (
          <button
            className={`filter-chip ${filter === c ? "selected" : ""}`}
            onClick={() => setFilter(c)}
            key={c}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="workout-list">
        {shown.map((w, i) => (
          <article className="workout-card" key={w.id}>
            <div className={`workout-art art-${i % 4}`}>
              <span className="art-index">0{i + 1}</span>
              <div className="workout-glyph">
                {i === 0 ? "↗" : i === 1 ? "✳" : i === 2 ? "〰" : "△"}
              </div>
              <span className="art-focus">{w.focus.toUpperCase()}</span>
            </div>
            <div className="workout-info">
              <div className="workout-tags">
                <span>{w.category}</span>
                <span>{w.level}</span>
              </div>
              <h3>{w.name}</h3>
              <p>
                A balanced session designed for real schedules and real energy.
              </p>
              <div className="workout-meta">
                <span>
                  <Clock3 size={14} />
                  {w.time} min
                </span>
                <span>
                  <Zap size={14} />
                  {w.xp} XP
                </span>
                <span>
                  <Target size={14} />
                  {w.moves.length} movements
                </span>
              </div>
            </div>
            <div className="workout-end">
              <button
                className="button button-primary"
                onClick={() => onStart(w)}
              >
                <Play size={14} fill="currentColor" /> Start
              </button>
              <small>
                {activities.some((a) => a.title === w.name)
                  ? "COMPLETED TODAY"
                  : "EQUIPMENT-FREE"}
              </small>
            </div>
          </article>
        ))}
        {shown.length === 0 && (
          <Empty
            icon={Search}
            title="No routines match"
            detail="Browse the single-exercise library below or try another filter."
          />
        )}
      </div>
      <section className="exercise-library">
        <div className="exercise-library-heading">
          <div>
            <span className="section-kicker">MOVEMENT LIBRARY</span>
            <h2>Choose a single exercise</h2>
          </div>
          <span>Camera support is listed for each movement</span>
        </div>
        <div className="exercise-library-grid">
          {exerciseLibrary
            .filter(
              (item) =>
                `${item.name} ${item.category} ${item.target}`
                  .toLowerCase()
                  .includes(search.toLowerCase()) &&
                (filter === "All" ||
                  item.category === filter ||
                  item.level === filter),
            )
            .map((item) => (
              <article className="exercise-library-card" key={item.name}>
                <div className="workout-tags">
                  <span>{item.category}</span>
                  <span>{item.level}</span>
                </div>
                <h3>{item.name}</h3>
                <p>{item.target}</p>
                <details className="exercise-instructions">
                  <summary>How to do it</summary>
                  <ol>{instructionsForExercise(item.name).map((line) => <li key={line}>{line}</li>)}</ol>
                </details>
                <small>
                  {item.equipment} · {item.duration}
                </small>
                <div className="exercise-library-mode">
                  <span
                    className={
                      item.mode === "Camera detection" ? "supported" : "guided"
                    }
                  >
                    {item.mode === "Camera detection" ? "✓ " : "◌ "}
                    {item.mode}
                  </span>
                  <button
                    className="button button-outline"
                    onClick={() =>
                      onStart({
                        id: `exercise-${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                        name: item.name,
                        category: item.category,
                        time: 5,
                        level: item.level,
                        focus: item.category,
                        moves: [`${item.name} · ${item.duration}`],
                        xp: 30,
                      })
                    }
                  >
                    <Play size={13} /> Start
                  </button>
                </div>
              </article>
            ))}
        </div>
      </section>
    </>
  );
}
function WorkoutModal({
  workout,
  step,
  setStep,
  seconds,
  paused,
  setPaused,
  finish,
  close,
}: {
  workout: Workout;
  step: number;
  setStep: (n: number) => void;
  seconds: number;
  paused: boolean;
  setPaused: (b: boolean) => void;
  finish: () => void;
  close: () => void;
}) {
  const parts = workout.moves[step]?.split(" · ") || ["Complete"];
  const movementSteps = instructionsForExercise(parts[0]);
  const [restSeconds, setRestSeconds] = useState(0);
  const [resting, setResting] = useState(false);
  useEffect(() => {
    if (resting && restSeconds > 0) {
      const timer = setTimeout(() => setRestSeconds((n) => n - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (resting && restSeconds === 0) {
      setResting(false);
      setPaused(false);
    }
  }, [restSeconds, resting, setPaused]);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0"),
    secs = String(seconds % 60).padStart(2, "0");
  return (
    <div className="modal-backdrop">
      <section
        className="session-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Workout session"
      >
        <header className="session-head">
          <div>
            <span className="section-kicker">WORKOUT SESSION</span>
            <strong>{workout.name}</strong>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close workout"
          >
            <X size={19} />
          </button>
        </header>
        <div className="session-progress">
          <span>
            MOVE {String(step + 1).padStart(2, "0")} /{" "}
            {String(workout.moves.length).padStart(2, "0")}
          </span>
          <div>
            {workout.moves.map((_, i) => (
              <i key={i} className={i <= step ? "active" : ""} />
            ))}
          </div>
        </div>
        <div className="session-body">
          <Suspense fallback={<div className="exercise-model-stage" role="status">Preparing movement model…</div>}>
            <ExerciseModel3D exercise={parts[0]} paused={paused || resting} />
          </Suspense>
          <div className="session-content">
            <span className="section-kicker">
              {workout.focus.toUpperCase()}
            </span>
            <h2>{parts[0]}</h2>
            <p>Move at a steady pace, and adjust the range to feel comfortable.</p>
            <ol className="session-instructions">
              {movementSteps.map((line) => <li key={line}>{line}</li>)}
            </ol>
            <div className="timer-display">
              {mins}
              <span>:</span>
              {secs}
              <small>ELAPSED</small>
            </div>
            <div className="session-controls">
              {resting && (
                <span className="rest-countdown">
                  REST · 00:{String(restSeconds).padStart(2, "0")}
                </span>
              )}
              <button
                className="button button-outline"
                disabled={resting || paused}
                onClick={() => {
                  setPaused(true);
                  setRestSeconds(30);
                  setResting(true);
                }}
              >
                <Clock3 size={14} /> 30 sec rest
              </button>
              <button
                className="button button-outline"
                onClick={() => setPaused(!paused)}
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                className="button button-primary"
                onClick={() =>
                  step + 1 >= workout.moves.length
                    ? finish()
                    : setStep(step + 1)
                }
              >
                {step + 1 >= workout.moves.length
                  ? "Finish session"
                  : "Next movement"}{" "}
                <ArrowRight size={15} />
              </button>
            </div>
            <button
              className="text-link skip-link"
              onClick={() =>
                step + 1 >= workout.moves.length ? finish() : setStep(step + 1)
              }
            >
              Skip this movement <ArrowRight size={13} />
            </button>
          </div>
        </div>
        <Suspense fallback={<div className="workout-camera" role="status">Preparing the on-device camera model…</div>}>
          <WorkoutCamera key={step} exercise={parts[0]} paused={paused} />
        </Suspense>
        <footer className="session-foot">
          <ShieldCheck size={15} /> Stop if you feel pain, dizziness, or unusual
          discomfort.<button onClick={finish}>End session</button>
        </footer>
      </section>
    </div>
  );
}
function QuestsView({
  state,
  complete,
  setPage,
  addWater,
  walkMinutes,
}: {
  state: AppState;
  complete: (s: string) => void;
  setPage: (p: Page) => void;
  addWater: () => void;
  walkMinutes: number;
}) {
  return (
    <>
      <div className="quest-banner">
        <div>
          <span className="micro-label">
            DAILY QUESTS · REFRESH AT MIDNIGHT
          </span>
          <h2>
            Good things happen
            <br />
            one step at a time.
          </h2>
          <p>Choose what fits your day. Every quest is optional.</p>
        </div>
        <div className="quest-banner-mark">
          <Target size={52} />
          <span>✦</span>
        </div>
      </div>
      <div className="quest-list">
        {quests.map((q, i) => {
          const done = state.completedQuests.includes(q.id);
          const n =
            q.id === "water"
              ? Math.min(100, state.water * 20)
              : q.id === "move"
                ? Math.min(
                    100,
                    state.activities.some(
                      (a) =>
                        a.kind === "Workout" &&
                        a.date === new Date().toLocaleDateString("en-CA"),
                    )
                      ? 100
                      : 0,
                  )
                : q.id === "walk"
                  ? Math.min(100, Math.floor((walkMinutes / 10) * 100))
                  : Math.min(
                      100,
                      state.activities.some(
                        (a) =>
                          a.kind === "Yoga" &&
                          a.date === new Date().toLocaleDateString("en-CA"),
                      )
                        ? 100
                        : 0,
                    );
          return (
            <article
              className={`quest-card ${done ? "quest-complete" : ""}`}
              key={q.id}
            >
              <div className={`quest-symbol symbol-${i}`}>{q.icon}</div>
              <div className="quest-copy">
                <div className="quest-meta">
                  <span>DAILY QUEST {String(i + 1).padStart(2, "0")}</span>
                  {done && (
                    <b>
                      <Check size={12} /> COMPLETE
                    </b>
                  )}
                </div>
                <h3>{q.name}</h3>
                <p>{q.description}</p>
                <div className="quest-progress">
                  <div>
                    <i style={{ width: `${n}%` }} />
                  </div>
                  <span>{done ? "Complete" : `${n}%`}</span>
                </div>
              </div>
              <div className="quest-reward">
                <strong>
                  +{q.reward}
                  <small> XP</small>
                </strong>
                <span>✦ {q.coins} coins</span>
                {!done && (
                  <button
                    className="button button-outline"
                    onClick={() =>
                      n === 100
                        ? complete(q.id)
                        : q.id === "water"
                          ? addWater()
                          : q.id === "move"
                            ? setPage("Workouts")
                            : q.id === "walk"
                              ? setPage("Walk")
                              : setPage("Yoga")
                    }
                  >
                    {n === 100
                      ? "Claim reward"
                      : q.id === "water"
                        ? "Log water"
                        : `Start quest`}{" "}
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="gentle-note">
        <Heart size={15} /> Rest days are part of progress. You can come back
        tomorrow.
      </p>
    </>
  );
}

function WalkView({
  walk,
  manual,
  setManual,
  start,
  end,
  seconds,
  distance,
  setDistance,
  speed,
  route,
  gpsAccuracy,
  walkError,
  setPage,
}: {
  walk: boolean;
  manual: boolean;
  setManual: (b: boolean) => void;
  start: () => void;
  end: () => void;
  seconds: number;
  distance: number;
  setDistance: (n: number) => void;
  speed: number;
  route: [number, number][];
  gpsAccuracy: number | null;
  walkError: string;
  setPage: (p: Page) => void;
}) {
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const paceSeconds = speed > 0.2 ? 1000 / speed : 0;
  const pace = paceSeconds
    ? `${Math.floor(paceSeconds / 60)}:${String(Math.floor(paceSeconds % 60)).padStart(2, "0")} /km`
    : "—";
  return (
    <div className="walk-grid">
      <section className="walk-main">
        <Suspense fallback={<div className="walk-map walk-map-empty">Loading map…</div>}>
          <LiveWalkMap route={manual ? [] : route} tracking={walk && !manual} manual={manual} />
        </Suspense>
        {walkError && <p className="walk-error" role="status">{walkError}</p>}
        {!manual && gpsAccuracy !== null && (
          <p className="gps-accuracy">GPS accuracy ±{Math.round(gpsAccuracy)} m · route points stay in this session</p>
        )}
        <div className="walk-stats">
          <div>
            <span>TIME</span>
            <strong>{time}</strong>
          </div>
          <div>
            <span>DISTANCE</span>
            <strong>
              {manual
                ? `${distance.toFixed(1)} km (manual)`
                : `${distance.toFixed(2)} km`}
            </strong>
          </div>
          <div>
            <span>PACE</span>
            <strong>{manual ? "—" : pace}</strong>
          </div>
        </div>
        <div className="walk-controls">
          <button
            className="button button-primary"
            onClick={walk ? end : start}
          >
            {walk ? (
              <>
                <Check size={16} /> Finish walk
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" /> Start walking
              </>
            )}
          </button>
          <label className="mode-switch">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              disabled={walk}
            />
            <span className="switch-slider" />
            <span>Manual mode</span>
          </label>
        </div>
        {walk && manual && (
          <div className="manual-stepper">
            <span>Manual distance estimate · no GPS is used.</span>
            <div>
              <button onClick={() => setDistance(Math.max(0, distance - 0.1))}>
                −
              </button>
              <strong>{distance.toFixed(1)} km</strong>
              <button onClick={() => setDistance(distance + 0.1)}>+</button>
            </div>
          </div>
        )}
      </section>
      <aside className="walk-aside">
        <div className="section-kicker">TODAY’S WALK QUEST</div>
        <h2>
          Take the
          <br />
          long way.
        </h2>
        <p>A little fresh air between classes can shift the whole day.</p>
        <div className="walk-goal">
          <div className="goal-ring">
            <Footprints size={24} />
          </div>
          <div>
            <strong>10 minutes</strong>
            <span>at your own pace</span>
          </div>
        </div>
        <div className="walk-tip">
          <span>✳</span>
          <p>
            {manual
              ? "Manual mode records time and any distance you enter as an estimate. GPS is not used."
              : "GPS distance filters inaccurate or stationary points. Precise location points are not saved."}
          </p>
        </div>
        <button className="text-link" onClick={() => setPage("Quests")}>
          View all quests <ArrowRight size={14} />
        </button>
      </aside>
    </div>
  );
}
function YogaView({
  selected,
  setSelected,
  seconds,
  running,
  toggle,
  finish,
}: {
  selected: (typeof poses)[number];
  setSelected: (p: (typeof poses)[number]) => void;
  seconds: number;
  running: boolean;
  toggle: () => void;
  finish: () => void;
}) {
  return (
    <div className="yoga-layout">
      <section className="yoga-feature">
        <div className="yoga-visual">
          <span className="yoga-orbit orbit-a" />
          <span className="yoga-orbit orbit-b" />
          <div className="yoga-ground" />
          <div className="yoga-person">
            <i className="y-head" />
            <i className="y-body" />
            <i className="y-arm left" />
            <i className="y-arm right" />
            <i className="y-leg left" />
            <i className="y-leg right" />
          </div>
          <span className="yoga-symbol">☼</span>
          <span className="yoga-visual-label">BREATHE IN · BREATHE OUT</span>
        </div>
        <div className="yoga-session">
          <div className="section-kicker">YOUR PRACTICE</div>
          <h2>{selected.name}</h2>
          <p>{selected.detail}</p>
          <div className="yoga-guidance">
            <div>
              <span>BREATH</span>
              <strong>Inhale slowly · exhale softly</strong>
            </div>
            <div>
              <span>SAFETY</span>
              <strong>Stay within a comfortable range</strong>
            </div>
          </div>
          <div className="yoga-timer">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </div>
          <div className="yoga-controls">
            <button
              className="button button-primary"
              onClick={seconds === 0 ? finish : toggle}
            >
              {seconds === 0 ? (
                <Check size={15} />
              ) : running ? (
                <Pause size={15} />
              ) : (
                <Play size={15} fill="currentColor" />
              )}
              {seconds === 0
                ? "Complete pose"
                : running
                  ? "Pause practice"
                  : "Start pose"}
            </button>
            <button className="button button-outline" onClick={finish}>
              Finish session
            </button>
          </div>
        </div>
      </section>
      <aside className="pose-list">
        <div className="panel-head">
          <div>
            <div className="section-kicker">EXPLORE</div>
            <h3>Find your flow</h3>
          </div>
        </div>
        <div className="pose-filters">
          <span>ALL LEVELS · BEGINNER TO INTERMEDIATE</span>
        </div>
        {poses.map((p, i) => (
          <button
            key={p.name}
            className={`pose-row ${p.name === selected.name ? "pose-active" : ""}`}
            onClick={() => setSelected(p)}
          >
            <span className={`pose-number pose-${i}`}>{p.symbol}</span>
            <span>
              <strong>{p.name}</strong>
              <small>
                {p.level} · {p.time}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
        <div className="pose-note">
          Move gently. Stop if anything feels uncomfortable.
        </div>
      </aside>
    </div>
  );
}
function ProgressView({
  state,
  weekly,
}: {
  state: AppState;
  weekly: { label: string; value: number }[];
}) {
  const max = Math.max(25, ...weekly.map((x) => x.value));
  const workoutsDone = state.activities.filter((activity) => activity.kind === "Workout").length;
  const yogaDone = state.activities.some((activity) => activity.kind === "Yoga");
  const walkedKm = state.activities
    .filter((activity) => activity.kind === "Walk")
    .reduce((total, activity) => {
      const legacyDistance = Number(activity.title.match(/([\d.]+) km/i)?.[1] ?? 0);
      return total + (activity.distanceKm ?? legacyDistance);
    }, 0);
  const achievements = [
    { icon: "🏅", name: "First Workout", detail: "Complete your first workout.", unlocked: workoutsDone >= 1 },
    { icon: "🧘", name: "Yoga Explorer", detail: "Complete your first yoga session.", unlocked: yogaDone },
    { icon: "🚶", name: "Walker", detail: "Walk 1 km in total.", unlocked: walkedKm >= 1 },
    { icon: "⭐", name: "1K XP", detail: "Earn 1,000 XP.", unlocked: state.xp >= 1000 },
    { icon: "💪", name: "Strong Start", detail: "Complete 10 workouts.", unlocked: workoutsDone >= 10 },
    { icon: "🔥", name: "7 Day Streak", detail: "Maintain a 7-day activity streak.", unlocked: state.longestStreak >= 7 },
  ];
  return (
    <>
      <div className="progress-summary">
        <div className="summary-big">
          <span className="section-kicker">YOUR CONSISTENCY</span>
          <strong>
            {state.activities.length
              ? Math.min(100, Math.round((state.activities.length / 7) * 100))
              : "—"}
            <small>{state.activities.length ? "%" : ""}</small>
          </strong>
          <p>
            {state.activities.length
              ? "Built from your activity this week."
              : "Not enough data yet. Every activity helps."}
          </p>
        </div>
        <div className="summary-stat">
          <span>SESSIONS</span>
          <strong>{state.activities.length}</strong>
          <small>logged activities</small>
        </div>
        <div className="summary-stat">
          <span>ACTIVE MINUTES</span>
          <strong>{state.activities.reduce((n, a) => n + a.minutes, 0)}</strong>
          <small>since you started</small>
        </div>
        <div className="summary-stat">
          <span>QUESTS DONE</span>
          <strong>{state.completedQuests.length}</strong>
          <small>daily milestones</small>
        </div>
      </div>
      <section className="panel achievement-panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">MILESTONES</div>
            <h3>Achievements</h3>
          </div>
          <span>{achievements.filter((item) => item.unlocked).length}/{achievements.length} unlocked</span>
        </div>
        <div className="achievement-grid">
          {achievements.map((item) => (
            <article className={`achievement-card ${item.unlocked ? "unlocked" : "locked"}`} key={item.name}>
              <span aria-hidden="true">{item.icon}</span>
              <div><strong>{item.name}</strong><small>{item.detail}</small></div>
              <b>{item.unlocked ? "UNLOCKED" : "LOCKED"}</b>
            </article>
          ))}
        </div>
      </section>
      <section className="panel chart-panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">LAST 7 DAYS</div>
            <h3>Your movement, at a glance</h3>
          </div>
          <span className="chart-key">
            <i /> Active minutes
          </span>
        </div>
        <div className="large-chart">
          <div className="chart-y-axis">
            <span>60</span>
            <span>40</span>
            <span>20</span>
            <span>0</span>
          </div>
          <div className="chart-content">
            <div className="chart-lines">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="chart-bars">
              {weekly.map((d, i) => (
                <div className="chart-day" key={i}>
                  <div className="chart-bar-wrap">
                    <div
                      className={`chart-bar ${d.value ? "has-data" : ""}`}
                      style={{
                        height: `${Math.max(1, (d.value / max) * 100)}%`,
                      }}
                    >
                      {d.value > 0 && <span>{d.value}</span>}
                    </div>
                  </div>
                  <span>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="panel history-panel">
        <div className="panel-head">
          <div>
            <div className="section-kicker">RECENT ACTIVITY</div>
            <h3>Your effort, recorded</h3>
          </div>
        </div>
        {state.activities.length === 0 ? (
          <Empty
            icon={ActivityIcon}
            title="Your story starts here"
            detail="Complete a walk, workout, or yoga session to see it here."
          />
        ) : (
          state.activities.slice(0, 8).map((a) => (
            <div className="history-row" key={a.id}>
              <div className="history-icon">
                <ActivityIcon size={17} />
              </div>
              <div>
                <strong>{a.title}</strong>
                <span>
                  {a.kind} · {a.minutes} min · {a.date}
                </span>
              </div>
              <b>+{a.xp} XP</b>
            </div>
          ))
        )}
      </section>
      <div className="projection-note">
        <Sparkles size={18} />
        <span>
          <strong>A gentle projection</strong>
          <small>
            {state.activities.length
              ? `At your current pace, that could be about ${Math.round((state.activities.length / Math.max(1, 7)) * 84)} sessions over 12 weeks. This is an estimate, not a promise.`
              : "Once you have activity logged, your 12-week habit estimate will appear here."}
          </small>
        </span>
      </div>
    </>
  );
}
function GuideView({
  startCamera,
  camera,
  error,
  videoRef,
  sound,
  toggleSound,
}: {
  startCamera: () => void;
  camera: boolean;
  error: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  sound: boolean;
  toggleSound: () => void;
}) {
  const [move, setMove] = useState("Bodyweight squat");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [language, setLanguage] = useState("English");
  const cue = () => {
    if (!sound) return;
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 587.3;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => context.close();
    } catch {}
  };
  return (
    <>
      <div className="guide-warning">
        <ShieldCheck size={16} />
        <span>
          This movement guide supports practice. It does not provide medical
          assessment or injury diagnosis.
        </span>
      </div>
      <div className="guide-grid">
        <section className="guide-stage">
          <div className="guide-toolbar">
            <div>
              <div className="section-kicker">MOVEMENT GUIDE</div>
              <h3>{move}</h3>
            </div>
            <select
              value={move}
              onChange={(e) => {
                setMove(e.target.value);
                cue();
              }}
              aria-label="Select exercise"
            >
              {[
                "Bodyweight squat",
                "Wall push-up",
                "Forward fold",
                "Standing lunge",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </div>
          <div className={`guide-animation ${playing ? "animating" : ""}`}>
            <div className="guide-orbit" />
            <div className="guide-floor" />
            <div
              className="guide-figure"
              style={{ animationDuration: `${2.6 / speed}s` }}
            >
              <i className="gf-head" />
              <i className="gf-torso" />
              <i className="gf-arm la" />
              <i className="gf-arm ra" />
              <i className="gf-leg ll" />
              <i className="gf-leg rl" />
            </div>
            <div className="guide-step">
              {playing ? "FOLLOW THE MOVEMENT" : "PAUSED"} <span>✦</span>
            </div>
          </div>
          <div className="guide-controls">
            <button
              className="icon-button"
              onClick={() => {
                setPlaying(!playing);
                cue();
              }}
              aria-label="Pause or play guide"
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button
              className="icon-button"
              onClick={() => {
                setPlaying(true);
                cue();
              }}
              aria-label="Restart guide"
            >
              <RotateCcw size={16} />
            </button>
            <label>
              SPEED{" "}
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0.75}>0.75×</option>
                <option value={1}>1×</option>
                <option value={1.25}>1.25×</option>
              </select>
            </label>
            <label>
              LANGUAGE{" "}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                {["English", "हिन्दी", "ಕನ್ನಡ"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="camera-panel">
          <div className="section-kicker">CAMERA CHECK-IN</div>
          <h3>Find your position</h3>
          <p>
            This Guide preview is optional and does not analyze movement. Choose
            a supported workout for live local pose analysis.
          </p>
          <div className="camera-preview">
            {camera ? (
              <video ref={videoRef} autoPlay playsInline muted />
            ) : (
              <div className="camera-idle">
                <div>
                  <UserRound size={34} />
                </div>
                <span>Your camera preview will appear here</span>
              </div>
            )}
          </div>
          {error && (
            <div className="inline-error" role="alert">
              {error}
            </div>
          )}
          {camera ? (
            <div className="camera-status">
              <span className="live-dot" /> CAMERA ACTIVE · PREVIEW ONLY
            </div>
          ) : (
            <button
              className="button button-outline full-button"
              onClick={startCamera}
            >
              Enable camera preview
            </button>
          )}
          <div className="camera-feedback">
            <div>
              <span>POSTURE SCORE</span>
              <strong>—</strong>
            </div>
            <p>
              {camera
                ? "This Guide preview does not analyze pose. Live rep detection is available inside supported workout sessions."
                : "This preview does not analyze movement. Camera permission is requested only after you choose Enable."}
            </p>
          </div>
          <button className="sound-row" onClick={toggleSound}>
            <span>{sound ? "Sound cues on" : "Sound cues off"}</span>
            <span className={`toggle ${sound ? "on" : ""}`} />
          </button>
          <p className="camera-disclaimer">
            Not medical advice. Stop if you feel pain or dizziness.
          </p>
        </section>
      </div>
    </>
  );
}
function CoachView({
  chat,
  message,
  setMessage,
  send,
  goal,
  experience,
  activityCount,
}: {
  chat: { from: "coach" | "you"; text: string }[];
  message: string;
  setMessage: (s: string) => void;
  send: () => void;
  goal: string;
  experience: string;
  activityCount: number;
}) {
  return (
    <div className="coach-layout">
      <section className="coach-chat">
        <div className="coach-chat-head">
          <div className="coach-avatar">
            <Sparkles size={19} />
          </div>
          <div>
            <strong>Your FITQUEST coach</strong>
            <span>
              <i /> Here to help you build a habit
            </span>
          </div>
        </div>
        <div className="chat-messages">
          {chat.map((m, i) => (
            <div key={i} className={`chat-message ${m.from}`}>
              <div className="chat-bubble">{m.text}</div>
              <span>{m.from === "you" ? "YOU" : "FITQUEST COACH"}</span>
            </div>
          ))}
        </div>
        <div className="prompt-suggestions">
          {[
            "Plan a 10-minute workout",
            "I need a motivation boost",
            "Suggest a recovery day",
          ].map((x) => (
            <button
              key={x}
              onClick={() => {
                setMessage(x);
                setTimeout(send, 0);
              }}
            >
              {x} <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about workouts, habits, or consistency…"
          />
          <button aria-label="Send message" type="submit">
            <ArrowRight size={17} />
          </button>
        </form>
        <div className="coach-disclaimer">
          General wellness guidance, not medical advice. Your messages stay in
          this browser session.
        </div>
      </section>
      <aside className="coach-aside">
        <div className="section-kicker">A NOTE ON THIS COACH</div>
        <h3>
          Thoughtful guidance,
          <br />
          not a diagnosis.
        </h3>
        <p>
          This local coach offers a small set of supportive responses. Connect
          an AI service to enable personalized coaching.
        </p>
        <div className="coach-context">
          <span>YOUR GOAL</span>
          <strong>{goal}</strong>
          <span>YOUR EXPERIENCE</span>
          <strong>{experience}</strong>
          <span>YOUR RECENT ACTIVITY</span>
          <strong>
            {activityCount
              ? `${activityCount} activities logged`
              : "Nothing logged yet"}
          </strong>
        </div>
        <div className="coach-safety">
          <ShieldCheck size={16} /> If something feels wrong, pause and check
          with a health professional.
        </div>
      </aside>
    </div>
  );
}
function ProfileView({
  state,
  edit,
  save,
}: {
  state: AppState;
  edit: boolean;
  save: (p: Partial<AppState["profile"]>) => void;
}) {
  const [draft, setDraft] = useState(state.profile);
  useEffect(() => setDraft(state.profile), [state.profile]);
  return (
    <div className="profile-layout">
      <section className="profile-hero">
        <div className="profile-avatar">
          {state.profile.name.slice(0, 1).toUpperCase()}
          <span>✦</span>
        </div>
        <div>
          <span className="section-kicker">YOUR FITQUEST PROFILE</span>
          <h2>{state.profile.name}</h2>
          <p>
            {state.profile.goal} · Level {levelForXp(state.xp)}
          </p>
        </div>
        <div className="profile-badges">
          <span>
            <Flame size={15} />
            {state.longestStreak} day best
          </span>
          <span>
            <Zap size={15} />
            {state.xp} XP earned
          </span>
        </div>
      </section>
      <section className="panel profile-fields">
        <div className="panel-head">
          <div>
            <div className="section-kicker">YOUR PREFERENCES</div>
            <h3>Fitness that fits you</h3>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Name">
            <input
              disabled={!edit}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="Fitness goal">
            <select
              disabled={!edit}
              value={draft.goal}
              onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
            >
              {[
                "General fitness",
                "Build strength",
                "Improve flexibility",
                "Improve stamina",
                "Build healthy habits",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Experience">
            <select
              disabled={!edit}
              value={draft.experience}
              onChange={(e) =>
                setDraft({ ...draft, experience: e.target.value })
              }
            >
              {["Beginner", "Intermediate", "Advanced"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Equipment">
            <select
              disabled={!edit}
              value={draft.equipment}
              onChange={(e) =>
                setDraft({ ...draft, equipment: e.target.value })
              }
            >
              {["No equipment", "Basic equipment", "Full gym"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Preferred session length">
            <select
              disabled={!edit}
              value={draft.duration}
              onChange={(e) =>
                setDraft({ ...draft, duration: Number(e.target.value) })
              }
            >
              {[5, 10, 20, 30, 45].map((x) => (
                <option key={x} value={x}>
                  {x === 45 ? "45+" : x} minutes
                </option>
              ))}
            </select>
          </Field>
          <Field label="Language">
            <select
              disabled={!edit}
              value={draft.language}
              onChange={(e) => setDraft({ ...draft, language: e.target.value })}
            >
              {["English", "Hindi", "Kannada"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
        </div>
        {edit && (
          <button className="button button-primary" onClick={() => save(draft)}>
            Save preferences <Check size={15} />
          </button>
        )}
      </section>
      <section className="panel profile-history">
        <div className="section-kicker">YOUR JOURNEY</div>
        <div className="journey-stats">
          <div>
            <strong>{state.activities.length}</strong>
            <span>activities</span>
          </div>
          <div>
            <strong>{state.completedQuests.length}</strong>
            <span>quests completed</span>
          </div>
          <div>
            <strong>{state.coins}</strong>
            <span>coins earned</span>
          </div>
        </div>
      </section>
    </div>
  );
}
function SettingsView({
  state,
  update,
  reset,
  themeMode,
  setThemeMode,
}: {
  state: AppState;
  update: (p: Partial<AppState>) => void;
  reset: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <div className="section-kicker">PREFERENCES</div>
        <h3>Your settings</h3>
        <SettingRow
          title="Appearance"
          desc="Choose a theme or follow your device setting."
          action={
            <select className="theme-select" aria-label="Appearance" value={themeMode} onChange={(event) => setThemeMode(event.target.value as ThemeMode)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          }
        />
        <SettingRow
          title="Daily reminder"
          desc="Browser notifications are not sent in this local build."
          action={<span className="setting-note">Not configured</span>}
        />
        <SettingRow
          title="Guide sound cues"
          desc="Optional audio feedback in the movement guide."
          action={
            <button
              className={`toggle ${state.sound ? "on" : ""}`}
              onClick={() => update({ sound: !state.sound })}
              aria-label="Toggle sound"
            />
          }
        />
        <SettingRow
          title="Reduce motion"
          desc="Respects your device’s reduced motion preference."
          action={<span className="setting-note">Automatic</span>}
        />
        <SettingRow
          title="Privacy & camera"
          desc="Workout camera analysis is optional and only starts when you choose Camera Mode. Frames stay in your browser and are not saved or uploaded."
          action={<span className="setting-note">On-device analysis</span>}
        />
      </section>
      <section className="panel settings-panel">
        <div className="section-kicker">DATA & ACCOUNT</div>
        <h3>Your data stays on this device</h3>
        <p className="settings-copy">
          This build saves progress in your browser’s local storage. It is not
          linked to an account or cloud database. Clearing browser data will
          remove saved progress.
        </p>
        <div className="setting-row">
          <div>
            <strong>Cloud sync & sign-in</strong>
            <span>
              {supabaseConfigured ? "Email sign-in is available under Community; activity and quest progress remain on this device." : "Add the project URL, public key, and schema to enable account-based friend invitations."}
            </span>
          </div>
          <span className="setting-note">{supabaseConfigured ? "Available in Community" : "Setup required"}</span>
        </div>
        {confirm ? (
          <div className="confirm-reset">
            <span>This clears local activity, coins, and quest progress.</span>
            <button className="text-link" onClick={reset}>
              Confirm clear
            </button>
            <button className="text-link" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="button button-danger"
            onClick={() => setConfirm(true)}
          >
            Clear local history
          </button>
        )}
      </section>
      <section className="integration-note">
        <ShieldCheck size={18} />
        <span>
          <strong>Privacy first</strong>
          <small>
            FITQUEST never stores raw GPS trails or camera frames. Supported
            workout poses are analyzed locally; other exercises stay manual or
            guided.
          </small>
        </span>
      </section>
    </div>
  );
}
function SettingRow({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Search;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <Icon size={23} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
export default App;
