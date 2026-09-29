import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { Camera, CameraOff, LoaderCircle } from "lucide-react";
import {
  detectionForExercise,
  formFeedback,
  landmarkAngle,
  plankFormQuality,
  type Landmark,
  type RepState,
  updateRepState,
} from "../lib/exerciseDetection";

type Props = { exercise: string; paused: boolean };
const connections: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
  [27, 31],
  [28, 32],
];

export function WorkoutCamera({ exercise, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const frameRef = useRef<number>(0);
  const pausedRef = useRef(paused);
  const mountedRef = useRef(true);
  const stateRef = useRef<RepState>({ phase: "Ready", reps: 0 });
  const holdStartRef = useRef<number | null>(null);
  const holdBreakRef = useRef<number | null>(null);
  const shownHoldRef = useRef(-1);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("Ready");
  const [reps, setReps] = useState(0);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [feedback, setFeedback] = useState(
    "Position your full body after starting the camera",
  );
  const [confidence, setConfidence] = useState("Waiting for camera");
  const definition = detectionForExercise(exercise);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused && videoRef.current) videoRef.current.pause();
    if (!paused && active) void videoRef.current?.play().catch(() => {});
  }, [paused, active]);

  const stop = () => {
    cancelAnimationFrame(frameRef.current);
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current)
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setActive(false);
    setLoading(false);
    setConfidence("Camera stopped");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(frameRef.current);
      landmarkerRef.current?.close();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const start = async () => {
    setError("");
    setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera access is not supported in this browser. Use manual tracking.",
        );
      const stream = await new Promise<MediaStream>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          settled = true;
          reject(new Error("Camera request timed out. Check camera access and try again."));
        }, 15000);
        navigator.mediaDevices
          .getUserMedia({
            audio: false,
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 20 },
            },
          })
          .then((value) => {
            if (settled) {
              value.getTracks().forEach((track) => track.stop());
              return;
            }
            settled = true;
            window.clearTimeout(timeout);
            resolve(value);
          })
          .catch((cause: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            reject(cause);
          });
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview could not be initialized.");
      video.srcObject = stream;
      await video.play();
      landmarkerRef.current = await new Promise<PoseLandmarker>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          settled = true;
          reject(new Error("Pose model startup timed out. Check the local model files and try again."));
        }, 20000);
        void (async () => {
          try {
            const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
            const model = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "/models/pose_landmarker_lite.task",
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numPoses: 1,
              minPoseDetectionConfidence: 0.55,
              minPosePresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            });
            if (settled) model.close();
            else {
              settled = true;
              window.clearTimeout(timeout);
              resolve(model);
            }
          } catch (cause) {
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(cause);
            }
          }
        })();
      });
      if (!mountedRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        return;
      }
      setActive(true);
      setConfidence("Model ready · local analysis");
      let lastFrame = 0;
      const detect = (now: number) => {
        const currentVideo = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;
        if (!currentVideo || !canvas || !landmarker || !streamRef.current)
          return;
        if (
          pausedRef.current ||
          currentVideo.readyState < 2 ||
          now - lastFrame < 110
        ) {
          frameRef.current = requestAnimationFrame(detect);
          return;
        }
        lastFrame = now;
        try {
          const result = landmarker.detectForVideo(currentVideo, now);
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          canvas.width = currentVideo.videoWidth;
          canvas.height = currentVideo.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const points = result.landmarks?.[0] as Landmark[] | undefined;
          if (points?.length) {
            ctx.lineWidth = Math.max(2, canvas.width / 180);
            ctx.strokeStyle = "#b9f4a5";
            ctx.fillStyle = "#ffffff";
            for (const [a, b] of connections) {
              if (
                (points[a]?.visibility ?? 1) < 0.4 ||
                (points[b]?.visibility ?? 1) < 0.4
              )
                continue;
              ctx.beginPath();
              ctx.moveTo(
                points[a].x * canvas.width,
                points[a].y * canvas.height,
              );
              ctx.lineTo(
                points[b].x * canvas.width,
                points[b].y * canvas.height,
              );
              ctx.stroke();
            }
            for (const point of points) {
              if ((point.visibility ?? 1) < 0.4) continue;
              ctx.beginPath();
              ctx.arc(
                point.x * canvas.width,
                point.y * canvas.height,
                Math.max(2.3, canvas.width / 150),
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            setConfidence("Pose detected · landmarks tracked");
            setFeedback(formFeedback(points));
            const angle = definition
              ? landmarkAngle(points, definition.category)
              : null;
            if (!definition) {
              setPhase("Guidance");
            } else if (angle === null) {
              holdStartRef.current = null;
              holdBreakRef.current = null;
              shownHoldRef.current = -1;
              setHoldSeconds(0);
              setFeedback("Full body not visible — adjust your camera angle");
              setPhase("Position yourself");
            } else if (definition.mode === "hold") {
              if (plankFormQuality(points)) {
                holdBreakRef.current = null;
                if (holdStartRef.current === null) holdStartRef.current = now;
                const elapsed = Math.floor((now - holdStartRef.current) / 1000);
                if (elapsed !== shownHoldRef.current) {
                  shownHoldRef.current = elapsed;
                  setHoldSeconds(elapsed);
                }
                setFeedback("Plank alignment looks steady · keep breathing");
                setPhase("Holding");
              } else {
                if (holdStartRef.current !== null) {
                  if (holdBreakRef.current === null) holdBreakRef.current = now;
                  else if (now - holdBreakRef.current > 700) {
                    holdStartRef.current = null;
                    holdBreakRef.current = null;
                    shownHoldRef.current = -1;
                    setHoldSeconds(0);
                  }
                }
                setFeedback(definition.cue);
                setPhase("Adjust");
              }
            } else {
              const next = updateRepState(stateRef.current, angle, definition);
              if (next !== stateRef.current) {
                stateRef.current = next;
                setPhase(next.phase);
                setReps(next.reps);
              }
              if (angle < definition.completionAngle + 12)
                setFeedback(definition.cue);
              else if (next.phase === "Ready")
                setFeedback("Good form visibility · begin the next rep");
            }
          } else {
            holdStartRef.current = null;
            holdBreakRef.current = null;
            shownHoldRef.current = -1;
            setHoldSeconds(0);
            setConfidence("No person detected");
            setFeedback(
              "Full body not visible — step back and face the camera",
            );
            setPhase("Waiting for pose");
          }
        } catch {
          setError(
            "Pose analysis stopped unexpectedly. Restart camera or continue in manual mode.",
          );
          stop();
          return;
        }
        frameRef.current = requestAnimationFrame(detect);
      };
      frameRef.current = requestAnimationFrame(detect);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      const e = cause as DOMException;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (mountedRef.current) {
        setError(
          e.name === "NotAllowedError" || e.name === "SecurityError"
            ? "Camera permission was denied. You can continue with manual tracking in this workout."
            : e.message?.includes("timed out")
              ? e.message
            : e.message?.includes("fetch") || e.message?.includes("model")
              ? e.message?.includes("timed out")
                ? e.message
                : "The pose model could not load. Check your connection and continue with manual tracking."
              : `${e.message || "Camera could not start."} Continue with manual tracking.`,
        );
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <section className="workout-camera" aria-label="Live exercise camera">
      <div className="workout-camera-frame">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label="Live camera preview"
        />
        <canvas ref={canvasRef} aria-label="Detected pose landmarks" />
        {!active && (
          <div className="workout-camera-idle">
            <Camera size={29} />
            <span>Permission is requested only when you start</span>
            <span>Camera frames stay on this device</span>
          </div>
        )}
        {active && (
          <span className="workout-live-badge">
            <i /> LIVE · LOCAL
          </span>
        )}
      </div>
      {error && (
        <p className="workout-camera-error" role="alert">
          {error}
        </p>
      )}
      <div className="workout-camera-stats">
        <div>
          <small>{definition?.mode === "hold" ? "HOLD TIME" : "REPETITIONS"}</small>
          <strong>
            {!definition
              ? "—"
              : definition.mode === "hold"
                ? `${String(Math.floor(holdSeconds / 60)).padStart(2, "0")}:${String(holdSeconds % 60).padStart(2, "0")}`
                : reps}
          </strong>
        </div>
        <div>
          <small>PHASE</small>
          <strong>{phase}</strong>
        </div>
        <div>
          <small>POSE STATUS</small>
          <strong>{confidence}</strong>
        </div>
      </div>
      <p className="workout-camera-feedback">{feedback}</p>
      <div className="workout-camera-actions">
        {active ? (
          <button className="button button-outline" onClick={stop}>
            <CameraOff size={14} /> Stop camera
          </button>
        ) : (
          <button
            className="button button-outline"
            disabled={loading}
            onClick={() => void start()}
          >
            {loading ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Camera size={14} />
            )}
            {loading ? "Loading pose model…" : "Start camera mode"}
          </button>
        )}
        <span>
          {definition
            ? definition.mode === "hold"
              ? "Live plank form check"
              : "Automatic rep counting"
            : "Camera guidance available · manual tracking"}
        </span>
      </div>
    </section>
  );
}
