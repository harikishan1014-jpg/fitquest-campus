import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/exerciseDetection.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const detection = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const dataSource = readFileSync(new URL("../src/data.ts", import.meta.url), "utf8");
const compiledData = ts.transpileModule(dataSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const appData = await import(`data:text/javascript;base64,${Buffer.from(compiledData.outputText).toString("base64")}`);
for (const item of appData.exerciseLibrary) {
  const cues = appData.instructionsForExercise(item.name);
  assert.equal(cues.length, 3, `${item.name} has three instructions`);
  assert.ok(!cues[0].startsWith("Set up "), `${item.name} has exercise-specific cues`);
}
for (const workout of appData.workouts) {
  for (const move of workout.moves) {
    const cues = appData.instructionsForExercise(move.split(" · ")[0]);
    assert.equal(cues.length, 3, `${move} has three session instructions`);
    assert.ok(!cues[0].startsWith("Set up "), `${move} has exercise-specific cues`);
  }
}

const walkSource = readFileSync(new URL("../src/lib/walkTracking.ts", import.meta.url), "utf8");
const compiledWalk = ts.transpileModule(walkSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const walk = await import(`data:text/javascript;base64,${Buffer.from(compiledWalk.outputText).toString("base64")}`);
const origin = { lat: 37.4219999, lon: -122.0840575, at: 1_000 };
assert.ok(Math.abs(walk.distanceMeters(origin, { ...origin, lat: origin.lat + 0.001 }) - 111.2) < 1, "GPS distance uses a geodesic calculation");
assert.ok(walk.acceptedWalkingSegment(origin, { ...origin, lat: origin.lat + 0.00005, at: 6_000 }, 10) > 5, "plausible walking fix is accepted");
assert.equal(walk.acceptedWalkingSegment(origin, { ...origin, lat: origin.lat + 0.000002, at: 6_000 }, 10), null, "stationary GPS jitter is ignored");
assert.equal(walk.acceptedWalkingSegment(origin, { ...origin, lat: origin.lat + 0.01, at: 31_000 }, 10), null, "impossible GPS jump is ignored");
assert.equal(walk.acceptedWalkingSegment(origin, { ...origin, lat: origin.lat + 0.00005, at: 6_000 }, 80), null, "poor accuracy GPS fix is ignored");

const profiles = [
  ["Bodyweight squat", "squat", [140, 100, 170]],
  ["Reverse lunge", "lunge", [140, 100, 170]],
  ["Push-ups", "pushup", [135, 90, 160]],
  ["Glute bridge", "bridge", [90, 160, 100]],
];

for (const [name, category, angles] of profiles) {
  const profile = detection.detectionForExercise(name);
  assert.equal(profile?.category, category, `${name} maps to its validator`);
  const state = angles.reduce(
    (previous, angle) => detection.updateRepState(previous, angle, profile),
    { phase: "Ready", reps: 0 },
  );
  assert.equal(state.reps, 1, `${name} completes exactly one full rep cycle`);
}

assert.equal(detection.detectionForExercise("Plank")?.mode, "hold");
const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
for (const [index, x, y] of [
  [11, 0.15, 0.42], [23, 0.5, 0.43], [27, 0.85, 0.44],
  [12, 0.15, 0.45], [24, 0.5, 0.46], [28, 0.85, 0.47],
]) landmarks[index] = { x, y, visibility: 1 };
assert.equal(detection.plankFormQuality(landmarks), true, "straight, visible plank line passes");
landmarks[23] = { x: 0.5, y: 0.8, visibility: 1 };
assert.equal(detection.plankFormQuality(landmarks), false, "sagging hip line fails");
landmarks[23] = { x: 0.5, y: 0.43, visibility: 0.1 };
assert.equal(detection.plankFormQuality(landmarks), null, "occluded body is not scored");

console.log("FITQUEST checks passed: five rep/form cases, GPS distance filtering, and instructions for every library/routine movement.");
