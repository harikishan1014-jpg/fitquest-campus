import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Props = { exercise: string; paused: boolean };

export default function ExerciseModel3D({ exercise, paused }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [failed, setFailed] = useState(false);
  const key = exercise.toLowerCase();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xeaf0e4, 0);
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 1.5, 7.6);
    camera.lookAt(0, 1.25, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa2ad98, 2.15));
    const keyLight = new THREE.DirectionalLight(0xfff4df, 3.1);
    keyLight.position.set(-3, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xc4d9ad, 1.7);
    rimLight.position.set(4, 2, -3);
    scene.add(rimLight);

    const material = (color: number, roughness = 0.72) => new THREE.MeshStandardMaterial({ color, roughness });
    const green = material(0x718d62), greenDark = material(0x4f704b), skin = material(0xc98f70), shoe = material(0x354d40);
    const model = new THREE.Group();
    scene.add(model);
    const makeBall = (parent: THREE.Object3D, radius: number, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), mat);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      parent.add(mesh);
      return mesh;
    };
    const segment = (parent: THREE.Object3D, length: number, radius: number, mat: THREE.Material, pos: [number, number, number]) => {
      const pivot = new THREE.Group();
      pivot.position.set(...pos);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), 4, 10), mat);
      mesh.position.y = -length / 2;
      pivot.add(mesh);
      parent.add(pivot);
      return pivot;
    };

    // A complete articulated mesh rig: joints rotate independently for each movement.
    const hips = new THREE.Group();
    hips.position.y = 1.57;
    model.add(hips);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 5, 12), green);
    torso.position.y = 0.49;
    hips.add(torso);
    makeBall(hips, 0.14, skin, [0, 1.07, 0], [0.94, 1.08, 0.9]);
    const shoulderY = 0.83;
    const leftArm = segment(hips, 0.63, 0.105, skin, [-0.3, shoulderY, 0]);
    const rightArm = segment(hips, 0.63, 0.105, skin, [0.3, shoulderY, 0]);
    const leftLeg = segment(model, 0.75, 0.14, greenDark, [-0.18, 1.57, 0]);
    const rightLeg = segment(model, 0.75, 0.14, greenDark, [0.18, 1.57, 0]);
    makeBall(leftLeg, 0.13, shoe, [0, -0.75, 0.12], [0.82, 0.52, 1.35]);
    makeBall(rightLeg, 0.13, shoe, [0, -0.75, 0.12], [0.82, 0.52, 1.35]);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshBasicMaterial({ color: 0x9cae90, transparent: true, opacity: 0.16 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.015, 0);
    ground.scale.set(1.2, 0.55, 1);
    scene.add(ground);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.012, 8, 72), new THREE.MeshBasicMaterial({ color: 0xc4d2b9 }));
    ring.position.y = 1.38;
    scene.add(ring);

    const isFloor = /push.?up|plank|mountain climber|burpee|bridge|crunch|dead bug/.test(key);
    const isJack = /jumping jack|star jump/.test(key);
    const isLunge = /lunge/.test(key);
    const isBridge = /bridge/.test(key);
    const isYoga = /pose|yoga|stretch|cat.?cow|fold|warrior|tree/.test(key);
    if (isFloor) {
      // Lay the complete rig down into a clear exercise-ready plank position.
      model.rotation.z = -Math.PI / 2;
      model.position.set(-0.5, 0.48, 0);
      camera.position.set(0, 2.15, 7.4);
      camera.lookAt(0, 1.15, 0);
      if (isBridge) model.rotation.z = -Math.PI / 2;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let alive = true;
    let elapsed = 0;
    let previousFrame = 0;
    const render = (now: number) => {
      if (!alive) return;
      frame = requestAnimationFrame(render);
      const frozen = pausedRef.current || reducedMotion;
      if (previousFrame && !frozen) elapsed += Math.min(0.05, (now - previousFrame) / 1000);
      previousFrame = now;
      const t = frozen ? 0.5 : elapsed;
      const wave = frozen ? 0 : Math.sin(t * (isJack ? 3.8 : 2.15));
      if (isFloor) {
        model.position.y = 0.43 + (isBridge ? Math.max(0, wave) * 0.22 : (isJack ? 0.02 : 0));
        leftArm.rotation.z = -0.1 + wave * (isJack ? 0.14 : 0.08);
        rightArm.rotation.z = 0.1 - wave * (isJack ? 0.14 : 0.08);
        leftLeg.rotation.z = wave * (isJack ? 0.22 : 0.09);
        rightLeg.rotation.z = -wave * (isJack ? 0.22 : 0.09);
      } else if (isJack) {
        leftArm.rotation.z = -0.2 - Math.max(0, wave) * 1.65;
        rightArm.rotation.z = 0.2 + Math.max(0, wave) * 1.65;
        leftLeg.rotation.z = -Math.max(0, wave) * 0.48;
        rightLeg.rotation.z = Math.max(0, wave) * 0.48;
        model.position.y = Math.max(0, wave) * 0.12;
      } else if (isLunge) {
        hips.position.y = 1.57 - Math.max(0, wave) * 0.2;
        leftLeg.rotation.z = wave > 0 ? -0.3 : 0.12;
        rightLeg.rotation.z = wave > 0 ? 0.12 : -0.3;
        torso.rotation.z = wave * 0.035;
      } else if (isYoga) {
        leftArm.rotation.z = -0.78 + wave * 0.035;
        rightArm.rotation.z = 0.78 - wave * 0.035;
        hips.rotation.z = wave * 0.025;
        model.rotation.y = Math.sin(t * 0.55) * 0.12;
      } else {
        hips.position.y = 1.57 - Math.max(0, wave) * 0.2;
        leftLeg.rotation.z = wave * 0.23;
        rightLeg.rotation.z = -wave * 0.23;
        leftArm.rotation.z = -0.25 - wave * 0.09;
        rightArm.rotation.z = 0.25 + wave * 0.09;
        torso.rotation.z = wave * 0.035;
      }
      if (!frozen && !isYoga) model.rotation.y = Math.sin(t * 0.35) * 0.08;
      renderer.render(scene, camera);
    };
    render(performance.now());
    const observer = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });
    observer.observe(host);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose();
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach((item) => item.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [key]);

  return (
    <div className="exercise-model-stage" aria-label={`${exercise} 3D exercise model`}>
      <div ref={hostRef} className="exercise-model-canvas" />
      <span className="model-label">{failed ? "3D preview unavailable" : "3D MOVEMENT GUIDE"}</span>
    </div>
  );
}
