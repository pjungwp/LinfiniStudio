# L'Infini Studio website (linfinistudio.com)

The company site for L'Infini Innovations LLC, with live demos of talking, animated characters.
Built on the character engine from CARE-AI (portrait animation, talking mouth, live voice), with every
education-specific part taken out.

## What is in this repository

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole site: hero, use cases, the cast, how it works, contact form, and the live demo stage |
| `public/studio.html` | **The Studio** (linfinistudio.com/studio): guest codes, minutes and limits. Password protected |
| `public/avatar-anim.js`, `public/talking-mouth.js` | Blinking, breathing, expressions and a talking mouth from a single portrait. Runs on the visitor's device |
| `public/vendor/facemesh/` | MediaPipe Face Mesh (Apache-2.0), served from this site so portraits never leave the device |
| `public/cast/<id>/` | Each portrait (`neutral.jpg`), its expression and talking pictures, `thumb.jpg` and `points.json` (face points found ahead of time) |
| `public/cast/<id>/cut/` | The same pictures with the background removed (transparent `.webp`), plus a copy of `points.json` |
| `public/demos.js` | The nine demos: names, portraits, voices, briefs and sample scripts (shared by the page and the server) |
| `public/scenes/` | Optional. Put `interview.webp`, `language.webp` or `talk.webp` here to use a picture behind that category's characters |
| `server/characters.js` | How each character behaves live, coaching criteria, and the recording instructions. Never sent to the browser |
| `server/samples.js`, `netlify/functions/samples.mjs` | `/api/samples`: saving, locking, listing and serving the sample recordings |
| `server/access.js` | The access rules: guest codes, minute allowances, the daily ceiling, the per-network limit. `npm test` checks them |
| `netlify/functions/session.mjs` | `/api/session`: checks access, reserves minutes, starts a live voice conversation, returns unused minutes when it ends |
| `netlify/functions/feedback.mjs` | `/api/feedback`: coaching notes, one set per real conversation |
| `netlify/functions/admin.mjs` | `/api/admin`: what the Studio page talks to |

## Who can use your credits (the Studio)

Go to **linfinistudio.com/studio** and sign in with `ADMIN_PASSWORD`. From there you can:

- **Create a guest code** for a person or group: how many minutes, how many days it lasts, an optional custom code (e.g. `ACOG-SMITH`) and a private note. You get a ready-to-send invitation to copy.
- **Manage codes:** +10 minutes, +30 days, switch off/on, edit (name, total minutes, expiry date, reset usage) or delete. Each shows minutes used, conversations and when it was last used.
- **Set the limits:** a daily ceiling for everyone together, the longest conversation, and conversations per network per hour. Optionally open the demos to everyone (the limits still apply).
- **Pause everything** with one button.
- **See usage:** today, the last 7 and 14 days, conversations turned away, and the last 40 conversations.

How minutes are counted: starting a conversation reserves its full length on the server straight away (never more than the guest's minutes left or the day's minutes left). When it ends, the unused part goes back, measured by the server's own clock. If a page never reports back, the full reservation is kept. Coaching notes can only be requested once per real conversation. Defaults: 60 minutes a day, 5 minutes per conversation, 6 conversations per network per hour, codes required.

Belt and braces: give this site its own OpenAI project and key, and set a budget and alerts for that project in OpenAI's billing settings.

## The demos (3 categories × 3)

The scripts, names, portraits and voices are in `public/demos.js`. How each character behaves live is in `server/characters.js`.

| Category | Demo | Character | Portrait | Voice | Coaching notes |
| --- | --- | --- | --- | --- | --- |
| Job interviews | Marketing coordinator | Laura Bennett | F02 | gleam | Yes |
| | Junior software engineer | Priya Raman | F11 | nira | Yes |
| | Patient services coordinator (non-clinical) | Dolores Reyes | F03 | sage | Yes |
| Language learning (same café meet-up) | Korean | Seo-yeon | F09 | noeul | Yes |
| | Japanese | Hana | F08 | harema | Yes |
| | Mandarin Chinese | Sophie | F04 | coral | Yes |
| Talk it through (same worry, three attitudes) | Supportive | Ama | F05 | marin | No |
| | Mentor | Rosa | F12 | shimmer | No |
| | Joker | Jess | F13 | gleam | No |

The language demos teach hello, nice to meet you, culture-specific small talk, thank you and goodbye, with a phrase card
(native script, romanization, meaning). The Talk it through characters are companions, not therapy: their instructions
step out of character and point to 988 (US) or local help if someone mentions a crisis, and the page says so.

## Sample recordings (free for visitors)

Each card has **Watch sample** (free, recorded) and **Talk live** (needs a guest code). Samples are recorded once, from the Studio:

1. Studio → **Sample recordings** → **Record samples** on a demo (or **Record all missing samples**). Use Chrome; keep the tab open.
2. Each character line is spoken once by the live voice (`gpt-live-1`, the character's own voice), recorded in your browser,
   trimmed of silence, saved as a 24 kHz WAV, and checked against the script. A take whose words drift is retried, up to 3 tries.
3. When every line is saved, the demo **locks**: nothing more can be recorded or replaced for it. A line whose words still
   didn't match closely is flagged; listen with **Preview**.
4. To redo a demo, **Delete samples…** (type DELETE to confirm), then record again.

The recording request only names a demo and a line number; the words come from the script on the server, so nothing else
can be recorded with your key. The visitor lines ("You might say…") are shown as text, never recorded.

## Backdrops: adaptive scene or original photo

Visitors choose with the **Scene / Photo** switch (on the cast section and on the stage); the choice is remembered on their device. Default: Scene.

- **Scene:** the portrait's background is removed and the character stands in a lit backdrop that fits the scene
  (an office, a café, a cosy lamp-lit corner) and adapts to their mood as they talk: warmer and brighter when they are
  pleased, cooler and dimmer when they are annoyed or worried. The colours are in the `.scene[data-scene=…]` and
  `.scene[data-mood=…]` rules in `index.html`.
- **Photo:** the original portrait in a round frame.

**Adding a new portrait.** Put its pictures in `public/cast/<id>/`, then make the cut-outs. The cut-outs were made with
[rembg](https://github.com/danielgatis/rembg) (`u2net_human_seg` model) and a colour-difference key that removes the light
halo of the original wall from the hair edges. Every expression and talking picture needs its own cut-out, and
`points.json` must be copied into `cut/`.

## Settings (Netlify environment variables)

| Name | Required | What it does |
| --- | --- | --- |
| `OPENAI_API_KEY` | For live demos | Without it the site works, but the demo buttons report that live demos are not switched on |
| `ADMIN_PASSWORD` | Yes | The Studio password. Make it long |
| `TICKET_SECRET` | No | Signs conversation tickets. Optional; change it to cancel every ticket in flight |
| `LIVE_MODEL` | No | Default `gpt-live-1` |
| `FEEDBACK_MODEL` | No | The model that writes coaching notes. Default `gpt-5.6-terra` |
| `FEEDBACK_EFFORT` | No | `low` (default), `medium` or `high` |

After changing a variable, trigger a new deploy.

## Contact form

The "Say hello" form uses Netlify Forms. After the first deploy, turn on form detection in the Netlify project
(Forms), and set where submissions are emailed. If a submission fails, the page asks the visitor to write to hello@linfinistudio.com.

## Privacy

Faces are animated on the visitor's device. Conversations are not recorded or stored: the transcript lives only in the
page, and coaching notes are deleted at OpenAI as soon as they are collected.
