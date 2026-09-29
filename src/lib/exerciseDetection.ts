export type Landmark = { x: number; y: number; visibility?: number };
export type ExerciseDetection = {
  label: string;
  category: string;
  startAngle: number;
  completionAngle: number;
  direction: "down" | "up";
  cue: string;
  mode?: "reps" | "hold";
};

const definitions: ExerciseDetection[] = [
  {
    label: "squat",
    category: "squat",
    startAngle: 155,
    completionAngle: 105,
    direction: "down",
    cue: "Sit your hips back and bend your knees",
  },
  {
    label: "lunge",
    category: "lunge",
    startAngle: 150,
    completionAngle: 105,
    direction: "down",
    cue: "Lower until your front knee bends comfortably",
  },
  {
    label: "push-up",
    category: "pushup",
    startAngle: 150,
    completionAngle: 95,
    direction: "down",
    cue: "Lower your chest with control",
  },
  {
    label: "glute bridge",
    category: "bridge",
    startAngle: 115,
    completionAngle: 155,
    direction: "up",
    cue: "Lift your hips while keeping your shoulders grounded",
  },
  {
    label: "plank",
    category: "plank",
    startAngle: 155,
    completionAngle: 165,
    direction: "up",
    cue: "Keep your shoulders, hips, and ankles in one steady line",
    mode: "hold",
  },
];

export function detectionForExercise(name: string): ExerciseDetection | null {
  const value = name.toLowerCase();
  if (value.includes("squat")) return definitions[0];
  if (value.includes("lunge")) return definitions[1];
  if (value.includes("push-up") || value.includes("push up"))
    return definitions[2];
  if (value.includes("glute bridge")) return definitions[3];
  if (value.includes("plank")) return definitions[4];
  return null;
}

export function jointAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const denom = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  if (!denom) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / denom))) * (180 / Math.PI);
}

export type RepState = { phase: "Ready" | "Down" | "Up"; reps: number };

export function updateRepState(
  previous: RepState,
  angle: number,
  exercise: ExerciseDetection,
): RepState {
  const { startAngle, completionAngle, direction } = exercise;
  if (direction === "down") {
    if (previous.phase === "Ready" && angle < startAngle - 8)
      return { ...previous, phase: "Down" };
    if (previous.phase === "Down" && angle <= completionAngle)
      return { ...previous, phase: "Up" };
    if (previous.phase === "Up" && angle > startAngle)
      return { phase: "Ready", reps: previous.reps + 1 };
  } else {
    if (previous.phase === "Ready" && angle < startAngle)
      return { ...previous, phase: "Down" };
    if (previous.phase === "Down" && angle >= completionAngle)
      return { ...previous, phase: "Up" };
    if (previous.phase === "Up" && angle < startAngle)
      return { phase: "Ready", reps: previous.reps + 1 };
  }
  return previous;
}

export function landmarkAngle(
  landmarks: Landmark[],
  category: string,
): number | null {
  // MediaPipe indices: shoulders 11/12, elbows 13/14, wrists 15/16,
  // hips 23/24, knees 25/26, ankles 27/28.
  const pairs: Record<
    string,
    [number, number, number, number, number, number]
  > = {
    squat: [23, 25, 27, 24, 26, 28],
    lunge: [23, 25, 27, 24, 26, 28],
    pushup: [11, 13, 15, 12, 14, 16],
    bridge: [11, 23, 25, 12, 24, 26],
    plank: [11, 23, 27, 12, 24, 28],
  };
  const indices = pairs[category];
  if (!indices) return null;
  const left = indices.slice(0, 3).map((i) => landmarks[i]);
  const right = indices.slice(3).map((i) => landmarks[i]);
  const visible = [...left, ...right].every(
    (p) => p && (p.visibility ?? 1) > 0.45,
  );
  if (!visible) return null;
  const a = jointAngle(left[0], left[1], left[2]);
  const b = jointAngle(right[0], right[1], right[2]);
  // Pick the clearer bend (smaller joint angle); use both sides to tolerate
  // partial occlusion while requiring both sides to be present.
  return Math.min(a, b);
}

export function plankFormQuality(landmarks: Landmark[]): boolean | null {
  const angle = landmarkAngle(landmarks, "plank");
  if (angle === null) return null;
  const indices = [11, 12, 23, 24, 27, 28];
  const vertical = indices.map((index) => landmarks[index].y);
  const bodyLineDrift = Math.max(...vertical) - Math.min(...vertical);
  return angle >= 155 && bodyLineDrift <= 0.22;
}

export function formFeedback(landmarks: Landmark[]): string {
  const visible = [0, 11, 12, 23, 24, 25, 26, 27, 28].filter(
    (i) => landmarks[i] && (landmarks[i].visibility ?? 1) > 0.45,
  ).length;
  if (visible < 7) return "Full body not visible — step back into frame";
  const shoulderSpan = Math.abs(landmarks[11].x - landmarks[12].x);
  if (shoulderSpan < 0.08) return "Move closer to the camera";
  return "Good form visibility · move with control";
}
