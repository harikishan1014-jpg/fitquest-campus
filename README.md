# FITQUEST Campus

FITQUEST is a mobile-responsive fitness and wellness app built with React, TypeScript, and Vite. It focuses on a useful local-first experience: onboarding, workouts, daily quests, walking, yoga, progress, a movement guide, and a supportive coaching interface.

## Run locally

```sh
pnpm install
pnpm dev
```

Create a production build with `pnpm build`; serve it with `pnpm preview`.

## Production launch setup

The local-first app can be deployed without backend credentials. Profiles, workouts, quests, progress, camera analysis, and walking sessions continue to work in the browser. To enable account sign-in and cross-device friend invitations, create a Supabase project, apply `supabase/schema.sql`, configure email auth, and set `VITE_SUPABASE_URL` plus the public anon/publishable key in the deployment environment. Add the public HTTPS site URL to Supabase Auth's allowed redirect URLs. Never use a service-role or secret key in frontend variables.

`pnpm check:launch` checks the production Supabase values and all required local camera/build assets. It reads `.env.production` and the process environment; it fails while Supabase is not configured. It does not deploy the site or test physical camera/GPS hardware. The Netlify build itself intentionally does not require Supabase, so the documented local-first fallback can be deployed before account sync is configured.

## GitHub and Netlify deployment

The root `netlify.toml` configures the production build, `dist` publish folder, SPA fallback, same-origin camera/geolocation permissions, and long-lived caching for the bundled pose model and MediaPipe WASM files. Netlify provides HTTPS for the deployed site, which is required by browser camera and geolocation APIs. The map loads OpenStreetMap tiles over HTTPS.

The local Git repository is initialized on the `main` branch. From the project root, run the following checks, then connect it to your new empty GitHub repository (replace the URL):

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm test:exercise
corepack pnpm build
git add .
git commit -m "Prepare FITQUEST CAMPUS for deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fitquest-campus.git
git push -u origin main
```

Then in Netlify, choose **Add new project → Import an existing project**, connect that GitHub repository, and deploy. The checked-in config supplies the build command and publish folder. For Supabase sign-in and friend sync, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under the Netlify site's environment variables before its production build, then redeploy. These are public browser configuration values; do not add a service-role key. After deployment, add the public HTTPS site origin to Supabase Auth's URL allow-list.

Alternatively, after installing/linking the Netlify CLI and completing the build above, deploy the built folder with:

```sh
corepack pnpm dlx netlify-cli login
corepack pnpm dlx netlify-cli init
corepack pnpm dlx netlify-cli deploy --prod --dir=dist
```

The `--prod` command publishes to the linked site's production URL. Verify camera and GPS on the deployed HTTPS domain with device permission granted; automated unit/build checks cannot substitute for a physical camera or location fix.

## What works in this build

- First-run preferences with back/continue navigation and input validation.
- Workout catalog search and filters plus a categorized single-exercise library; an elapsed session timer, pause/resume, movement progression, skip/end controls, and session recovery after page refresh.
- Centralized XP, coins, level, and streak updates; same-day activity names and quest claims are idempotent.
- Daily workout, yoga, walk, and hydration quest progress and one-time claims.
- Manual walking with an explicitly labeled user-entered distance estimate. GPS walking asks permission only after selection, filters low-quality/stationary GPS points, calculates distance in-session, and discards raw points at finish.
- Timed yoga pose practice; activity history and actual-data weekly progress.
- Optional workout camera mode using MediaPipe Pose Landmarker in the browser, with a mirrored live preview, local landmark skeleton, pose visibility/status feedback, and phase-based repetition counting. The Lite model and WASM runtime are bundled locally; camera frames are not stored or uploaded.
- Automatic rep counting for squats, lunges/reverse lunges, push-ups/knee push-ups/incline push-ups, and glute bridges. Planks, crunches, mountain climbers, shoulder press, arm raises, bicep curls, jumping jacks, high knees, burpees, and yoga/mobility moves stay in manual tracking or camera guidance mode.
- Clear manual fallback for camera denial, unsupported browsers, missing devices, or model load errors. Camera streams and the detector are cleaned up when the movement camera stops or the workout closes.
- An articulated, animated Three.js exercise model for workout movements, with step-by-step instructions in both the movement library and active session. If WebGL is unavailable, the written cues remain available.
- Coach guidance, editable preferences, settings, and shareable friend invitations. Accepted invitations are stored locally or synced between accounts when Supabase is configured.
- Local profile and activity persistence in browser storage.

## External integrations and limitations

This checkout has no Supabase project or credentials. With production variables configured and `supabase/schema.sql` applied, the Community page supports email sign-up/sign-in and account-based friend invitations with expiring single-use codes. Profiles are only readable by their owner and accepted friends; friendship creation runs through restricted database functions. Activity, quest, and progress remain local. Activity and reward writes are intentionally restricted to a trusted server function; implement that validation and idempotency before enabling cloud rewards. Never place a service-role key in Vite variables.

The coach uses local supportive fallback copy, not an AI service. The exercise preview is a procedural, articulated Three.js model; it is an instructional visual guide, not a motion-capture avatar. Pose feedback is limited to visible-body guidance and simple exercise-specific movement cues; it is not a medical or comprehensive form assessment. Camera mode needs an HTTPS origin (localhost is supported) and a working camera. The Guide page's separate camera panel is preview-only; pose analysis starts from the workout modal. With Supabase configured and the schema applied, email accounts and friend invitations sync across devices; without it, local invitation acceptance remains available. Campus maps/landmarks, rewards catalog, story unlocks, nutrition diary, offline service worker, and cloud profile photos are not active in this build.

GPS needs a secure context (HTTPS or localhost), user location permission, and a usable device fix. Tracking waits for the first accurate location rather than failing after a single short request; the live OSM map and route appear when the browser returns coordinates. GPS remains session-only; browser background suspension may interrupt tracking. Manual mode remains available and does not claim GPS measurement.
