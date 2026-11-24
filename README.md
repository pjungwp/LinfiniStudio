# L'Infini Studio website (linfinistudio.com)

The company site for L'Infini Innovations LLC, with live demos of talking, animated characters.
Built on the character engine from CARE-AI (portrait animation, talking mouth, live voice), with every
education-specific part taken out.

## What is in this repository

| Path | What it is |
| --- | --- |
| `public/index.html` | The whole site: hero, use cases, the cast, how it works, contact form, and the live demo stage |
| `public/avatar-anim.js`, `public/talking-mouth.js` | Blinking, breathing, expressions and a talking mouth from a single portrait. Runs on the visitor's device |
| `public/vendor/facemesh/` | MediaPipe Face Mesh (Apache-2.0), served from this site so portraits never leave the device |
| `public/cast/<id>/` | Each portrait (`neutral.jpg`), its expression and talking pictures, `thumb.jpg` and `points.json` (face points found ahead of time) |
| `public/cast/<id>/cut/` | The same pictures with the background removed (transparent `.webp`), plus a copy of `points.json` |
| `public/scenes/` | Optional. Put `interview.webp`, `customer.webp`, `smalltalk.webp` or `storyteller.webp` here to use a picture behind that character |
| `public/ui/` | The stage curtains |
| `server/characters.js` | The four characters: their instructions, voice and coaching rubric. Never sent to the browser |
| `netlify/edge-functions/session.js` | `/api/session`: starts a live voice conversation (holds the API key and the character's instructions) |
| `netlify/edge-functions/feedback.js` | `/api/feedback`: writes coaching notes after a practice scene, then deletes them at OpenAI |

## The cast

| Card | Character | Portrait | Voice | Coaching notes |
| --- | --- | --- | --- | --- |
| Workplace: the job interview | Grace Park, hiring manager | F09 | sage | Yes |
| Workplace: the late replacement | Jess Carter, upset customer | F13 | coral | Yes |
| Language & social: Saturday market | Ama Mensah, market baker | F05 | marin | Yes |
| Stories & companions | Rosa, storyteller | F12 | shimmer | No |

To change what a character says or does, edit `server/characters.js`. To change what the card and the brief show,
edit the `CAST` list near the top of the script in `public/index.html`.

## Backdrops: adaptive scene or original photo

Visitors choose with the **Scene / Photo** switch (on the cast section and on the stage); the choice is remembered on their device. Default: Scene.

- **Scene:** the portrait's background is removed and the character stands in a lit backdrop that fits the scene
  (office, support desk, market, firelight) and adapts to their mood as they talk: warmer and brighter when they are
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
| `DEMO_CODE` | No, but recommended | If set, visitors must type this code before a live demo. Every conversation is billed to your OpenAI key |
| `DEMO_MINUTES` | No | Longest conversation in minutes. Default 5 |
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
