# CLAUDE.md: Menu Scanner by Harrison Stock Fitness

## What this project is

A mobile-first web app. Someone photographs a restaurant or takeaway menu (or types it in, uploads a PDF/Word copy, or picks a UK chain) and gets course-by-course picks for their goal (cutting, maintenance or bulking) and dietary restrictions. It is a lead magnet for Harrison Stock's personal training business in Exeter.

It is a **separate product** from the HS PT coaching app (`harrison-stock/HS-PT-App`) and stays that way: separate repo, separate deployment, separate Supabase project, so leads never mix with training clients. It should *look* like the HS PT app (see Brand below), but don't merge code or data with it.

Live URL: hosted on Vercel, auto-deploys from `main`.
Brand: Harrison Stock Fitness, harrisonstock.co.uk / @harrisonstockfit

## Tech stack

- Vanilla HTML/CSS/JS frontend in `public/` (no frameworks, no build step)
- One Vercel serverless function: `api/analyse.js` (Node, ESM, `@anthropic-ai/sdk`)
- Supabase (the scanner's own project, ref `sjxoihkqmubrmkbrbxre`) for sign-in, the `profiles` table and the daily scan allowance. The client is vendored at `public/vendor/supabase-js.js`
- Claude API, model `claude-sonnet-5-5`, with vision for menu photos
- pdf.js and mammoth (from cdnjs) to pull text out of PDF and .docx menus in the browser

## User flow

1. Landing page
2. Sign up / sign in (email + password, Supabase Auth). Returning users with a live session skip straight past this
3. Profile: goal, optional calorie target, dietary restrictions. Saved to the `profiles` table
4. Scanner: camera photo, document upload, chain picker, or typed menu
5. Course picker: starters, mains, sides, desserts, drinks
6. Results: dish cards per course (pick / avoid, kcal and macros), a "craving something else?" box for a verdict on one dish, then scan another
7. Settings: name, goal, calories, restrictions, theme, sign out

## Bot check (Cloudflare Turnstile)

Sign-in, sign-up and password reset carry a Turnstile token, which Supabase Auth checks once CAPTCHA protection is on for the scanner's project. Supabase can't check sign-up alone, so the widget covers all three. The site key is `TURNSTILE_SITE_KEY` at the top of `public/app.js` (public by design). Empty means no widget and no token, which is correct only while CAPTCHA is off in Supabase.

Order matters when switching it on:
1. Set the site key in `app.js` and deploy. The widget's allowed hostnames must include the scanner's domain.
2. Only then put the secret key in Supabase (scanner project) → Authentication → Bot and Abuse Protection, and switch CAPTCHA on.

The other way round, every sign-in fails until the widget exists to answer. Same arrangement as `Login.jsx` in the HS PT app.

## How `/api/analyse` works

- **Every request must carry the user's Supabase access token** (`Authorization: Bearer ...`). The function calls the `claim_scan` RPC with that token, which both proves the caller is signed in and takes one of today's slots. No token, bad token, or no slots left means no Claude call.
- **Daily allowance:** 3 menu scans and 10 craving checks per user per day, reset at midnight UK time. Counted server-side in `scan_usage`; see `supabase/migrations/20261009000001_scan_usage.sql`. Users can't read or edit that table directly. There's deliberately no refund function, because anything the API can call with the user's token, the user can call too.
- It fails closed: if the allowance can't be checked, the request is refused.
- Two modes: a menu scan (`submit_picks` tool) and a single-dish craving check (`mode: "craving"`, `submit_verdict` tool). Both use `tool_choice: auto` with `strict: true` tools, retrying once if Claude doesn't call the tool. Sonnet 5.5 rejects forced `tool_choice`.
- `output_config.effort` is `low`; thinking is left at the model default (adaptive). `max_tokens` covers thinking as well as output, so don't cut it back to the old 600/1600.
- Input caps: menu text 20,000 chars, chain name 80, dish 200, images JPEG/PNG/WebP/GIF only.
- The API key stays server-side. Never expose it to the client.

## Photos

`public/app.js` shrinks every photo to 1600px on the long edge as a JPEG before sending (same idea as `src/lib/imageCompress.js` in the HS PT app). Without that, a normal phone photo breaks Vercel's 4.5MB request limit and Claude's 5MB image limit. Don't remove it. Test camera capture on a real phone after touching any of this: that's the primary use case.

## The system prompts

The prompts live in `api/analyse.js`: `SCAN_SYSTEM_PROMPT`, `CRAVING_SYSTEM_PROMPT`, and the shared `GOAL_GUIDANCE`, `CALORIE_RULES` and `TONE_RULES` blocks. That file is the source of truth. **Don't change prompt wording without confirming with Harrison first.** `TONE_RULES` in particular is his voice, so leave it alone unless asked.

`SCAN_SYSTEM_PROMPT` is fully static so the cached prefix holds across requests. Anything that varies per request (courses, profile) goes in the user message.

## Database

Schema changes go in `supabase/migrations/` as plain SQL, written to be safe to run twice. There's no migration runner here: Harrison runs each file in the Supabase SQL editor for the scanner project **before** the code that depends on it reaches `main`. The `profiles` table predates this folder and isn't in it yet.

## Brand and tone rules (UI copy and anything you write)

- UK English always (colour, favour, specialise, programme)
- No fitness-bro energy. Calm, competent, direct.
- No generic AI language. The banned-word list in `TONE_RULES` applies to all copy, not just API responses.
- No exclamation marks, no emoji, no hype, no em dashes
- Mobile-first. This tool will almost exclusively be used on phones in restaurants.
- No stock photos

Visual identity follows the HS PT app (`src/index.css` there is the reference):

- **Tokens:** the `:root` block in `public/styles.css` mirrors the app's colours, including the contrast-fixed `--text-3`. If the app changes a token, change it here too.
- **Type:** Orbitron for headings and figures, JetBrains Mono for everything else (the app's default body face; it also offers Exo 2, the scanner doesn't). No Inter.
- **Type floor:** nothing under 11px, sentences at 13px or more, the same floor the app uses for clients.
- **Icons:** the brand set, copied from the app's `public/icons` into `public/icons/` (kebab-case names), drawn as CSS masks via `.bi .bi-<name>` so they take the surrounding text colour. Copy more across from the app rather than drawing new ones.
- **Theme:** follows the phone by default (`system`), with light/dark overrides in Settings.
- **Macros:** always in the order kcal, protein, carbs, fat, coloured blue, amber, teal, coral, as on the app's recipe cards.
- **"Heads up" dishes** are amber, not red: information, not a warning.
- Home-screen and tab icons are the HS mark, the same files as the app's.

## What NOT to build (parked for v2)

- Calorie target calculator
- Scan history
- Barcode scanning
- Meal logging
- Admin dashboard

Do not add any of these unless explicitly asked.

## CTA and lead capture

Email is captured at sign-up, before the first scan. The results screen ends with a subtle CTA:

"Want help building a full nutrition plan? Book a free call with Harrison → harrisonstock.co.uk"

## When making changes

- Keep the codebase simple. No frameworks, build tools, or complexity that isn't needed.
- Preserve the user flow unless told otherwise.
- Confirm with Harrison before changing any system prompt.
