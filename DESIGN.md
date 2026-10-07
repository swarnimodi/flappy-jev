---
name: Flappy Jev
description: Classic arcade Flappy, played straight, with a board beside it that shows what the pilot was told and how sure it was.
colors:
  orange: "#e86a17"
  orange-hi: "#f7a43c"
  orange-lo: "#a8440a"
  green: "#73bf2e"
  green-lo: "#4f7d1c"
  pipe-hi: "#a6ea63"
  grass: "#9de24a"
  bush: "#7dcf6b"
  sky: "#71c5cf"
  cloud: "#e4f6f1"
  city: "#aedfcd"
  sand: "#ded895"
  sand-line: "#cdbf73"
  bird-yellow: "#f9d43a"
  bird-shade: "#e59a25"
  bird-wing: "#fdf0a8"
  bird-beak: "#f0642b"
  bird-eye: "#241a1f"
  plum: "#543847"
  ink: "#3b2832"
  ink-soft: "#6a4f45"
  board: "#e9dba0"
  board-hi: "#f6edc4"
  board-lo: "#d3c27a"
  well: "#f8f1cf"
  white: "#fffdf2"
  surround: "#1c3138"
typography:
  display:
    fontFamily: "'Jersey 20', ui-monospace, 'Courier New', monospace"
    fontSize: "80px"
    fontWeight: 400
    lineHeight: 1
  headline:
    fontFamily: "'Jersey 20', ui-monospace, 'Courier New', monospace"
    fontSize: "60px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "'Jersey 20', ui-monospace, 'Courier New', monospace"
    fontSize: "40px"
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: "'Jersey 20', ui-monospace, 'Courier New', monospace"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  none: "0px"
spacing:
  line: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.orange}"
    textColor: "{colors.white}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "8px 20px 12px"
  button-primary-hover:
    backgroundColor: "#f07a25"
  button-primary-disabled:
    backgroundColor: "{colors.board-lo}"
    textColor: "{colors.ink-soft}"
  button-quiet:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "8px 12px 10px"
  button-quiet-hover:
    backgroundColor: "{colors.board-hi}"
  board:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "18px 16px 20px"
    width: "300px"
  card:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "18px 14px 20px"
  well:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 10px"
  meter:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.none}"
    height: "28px"
  meter-fill:
    backgroundColor: "{colors.ink-soft}"
  meter-fill-flap:
    backgroundColor: "{colors.green}"
  playfield:
    backgroundColor: "{colors.sky}"
    rounded: "{rounded.none}"
---

# Design System: Flappy Jev

## Overview

**Creative North Star: "The Cabinet and the Clipboard"**

The world is the category canon, and it is the user's choice. Asked in a structured question over a rolled direction, Swarnim picked: "Classic arcade look: blue sky, green pipes, a chunky bird, big score at the top. My own drawing in that style, not the original game's artwork." Everything here follows from that sentence. The playfield is an arcade cabinet in daylight: sky blue, green pipes, a striped ground, a yellow bird, a big white score. Nothing on it is a copy of the original sprites; every shape is drawn in code for this project.

On each side of the cabinet sits a tan board, the same tan the arcade uses for its scoreboard: the live answer on the left, the crash notes on the right, the game in the middle (Swarnim's request, 6 Oct 2026). On narrower windows one board sits beside the game and the other below; on phones both go below. They are the clipboard: one shows the pilot's live answer (what it was told, how sure it was, how long it took), the other what its crashes have taught it. The boards borrow the cabinet's materials (plum outline, stepped bevel, pixel type) so the reading surface and the game read as one object. The page around them is a single dark teal surround that carries no content.

The system is flat, square and stepped. There is one typeface at one weight, one outline colour, no gradients, no blur and no rounded corners. The direction refuses the dark AI-dashboard look: the product is about a model's decisions, and it shows them on daylight tan in plain words, never on a dark panel of charts.

**Key Characteristics:**
- One typeface, Jersey 20, at one weight, set only on its 20 px grid.
- Plum is the only outline colour: 4 px in the page, 2 px in the canvas art.
- Flat fills everywhere; depth is a stepped bevel, never a blur or a gradient.
- Square corners throughout; curves exist only as 2 px stair-steps in the art.
- All art is drawn in code on a 2 px grid in a 360 x 640 world. No image files.
- Daylight palette: sky, green and tan carry the surface; the dark surround is only the room.

## Colors

A daylight arcade palette: one sky blue, a family of greens, a tan board family, and warm plum-brown inks, with orange held back for the one thing to press.

### Primary
- **Slab Orange** (`orange`, with `orange-hi` and `orange-lo` as its bevel steps): the primary button, and nothing else in the page. `orange-lo` doubles as the text colour for a game speed below normal, the only warning tint in the system.

### Secondary
- **Pipe Green** (`green`, with `green-lo` as its shade): pipes, grass stripes, and the probability meter's fill once the answer is at or over the flap line. `pipe-hi`, `grass` and `bush` are the lighter greens used only in the canvas.

### Tertiary
- **Arcade Sky** (`sky`): the playfield ground colour, also set as the playfield's CSS background so there is no flash before the canvas paints. `cloud` and `city` are the two pale tints of the far backdrop; `sand` and `sand-line` are the ground below the grass.
- **Bird Yellow** (`bird-yellow`, shaded with `bird-shade`, wing `bird-wing`, beak `bird-beak`, eye `bird-eye`): the bird sprite only. These five never leave the sprite.

### Neutral
- **Plum Outline** (`plum`): every border and outline, the text outline on the sky, and the meter's flap line.
- **Ink** (`ink`): text on tan. **Soft Ink** (`ink-soft`): labels, hints, empty values, and the meter fill below the flap line.
- **Board Tan** (`board`, with `board-hi` and `board-lo` as its bevel steps): the boards, the crash and pause card, the quiet button. `board-lo` is also the divider between crash notes and the scrollbar track.
- **Well Cream** (`well`): the recessed panels inside a board (what Jev was told, the crash notes list, the meter track, inline code).
- **Score White** (`white`): type on the sky and on the orange button. A warm white; pure white is not used.
- **Surround Teal** (`surround`): the page background behind the cabinet and the boards.

### Named Rules
**The Plum Line Rule.** Every outline in the system is `plum`. Black is not used for outlines, text or shadow anywhere.

**The Green Means Flap Rule.** In the page, green appears in exactly one place: the meter fill when the answer is at or over 50%. Below the line the fill is `ink-soft`. Green is never decoration on the boards.

**The One Orange Rule.** Orange is the primary button. There is one primary button on screen at a time, and no other element takes the orange fill.

**The Daylight Rule.** Content sits on sky, tan or cream. `surround` is the room around the cabinet; nothing is ever set on it.

## Typography

**Display Font:** Jersey 20 (with ui-monospace, 'Courier New', monospace), loaded from Google Fonts
**Body Font:** the same face

**Character:** A chunky pixel face drawn on a 20 px grid, used for everything from the score to the smallest label. One family, one weight (400), with `font-synthesis: none` so no faux bold or italic is ever drawn. Hierarchy comes from size and from ink versus soft ink, nothing else.

### Hierarchy
- **Display** (400, 80px default, line-height 1): the live score at the top of the playfield. Sized from the playfield width, snapped to the 20 px grid; 40px on a phone-width field.
- **Headline** (400, 60px default, line-height 1): the title lettering on the sky. Also sized from the playfield width and snapped; 40px on a phone-width field.
- **Title** (400, 40px, line-height 1): board headings, the card headline, the primary button label, and the percentage in the verdict line.
- **Body** (400, 20px, line-height 1.2): everything else: labels, values, notes, hints, the quiet button. Notes are capped at 30ch.

There is no separate label style. A label is body type in `ink-soft`.

### Named Rules
**The Twenty Grid Rule.** Jersey 20 is set only at multiples of 20 px. Fixed sizes in the build are 20 and 40; the two fluid sizes snap with `round(px / 20) * 20` and stay between 40 and 80. A size between grid steps blurs the face and is a bug.

**The Outline On Sky Rule.** Type that sits directly on the playfield is `white` with a `plum` outline (0.1em stroke painted under the fill) and a one-step hard `plum` drop of 0.05em. Type on tan or cream is plain `ink` with no outline and no shadow.

**The One Weight Rule.** Weight 400 only. Emphasis is a size step up the grid, never bold.

## Layout

The stage is a centred, wrapping flex row on the surround, with 16px page padding and 24px between pieces. The playfield comes first and is the fixed point: a 9:16 portrait at the full available height, between 200 and 540 CSS px wide, plus its 4px border. The two boards are 300px wide and stretch to the playfield's height, so the three pieces read as one bench.

The playfield's size is computed, not fluid. The canvas backing store is snapped to a multiple of half a world pixel where that stays within 80% of the best fit, so the 2 px art lands on whole device pixels. The script publishes the result as `--field-w`, `--field-h`, `--score-size` and `--head-size`, and the boards read their height from it.

Responsive behaviour is structural:
- **Wide (1060px and up):** playfield, answer board, crash-notes board in one row.
- **Up to 1059px:** the crash-notes board drops below and spans the playfield plus the answer board; its list caps at 300px tall.
- **Up to 720px:** one column, 16px gaps, content starts at the top. Boards take the playfield's width (288px minimum). The answer section moves to the top of its board and the board's own heading is hidden, so the live answer is in view directly under the game.

Inside a board, spacing is a loose 2px-stepped rhythm built around the 4px line: 18px above a section label, 6px below it, 4px between rows of a stats list, 8 to 10px of padding in a well. Overlays on the playfield are positioned in percentages of the field (score 5% from the top; card inset 6% each side) so they scale with it.

Values that can change length keep a reserved slot: each "what Jev was told" row holds two lines (48px) so the board does not jump while it is being read.

## Elevation & Depth

Flat, with a stepped bevel. No blur, no gradient, no translucency and no ambient shadow anywhere. A raised surface is shown the way pixel art shows it: a 4px lighter step along the inside top edge and a 4px darker step along the inside bottom edge, inside a 4px plum border. A recessed surface (a well) is the lighter cream with the same border and no bevel.

### Shadow Vocabulary
- **Board bevel** (`box-shadow: inset 0 4px 0 var(--board-hi), inset 0 -4px 0 var(--board-lo)`): boards, the crash and pause card, the title-screen note.
- **Button bevel and base** (`box-shadow: inset 0 4px 0 <hi>, inset 0 -4px 0 <lo>, 0 4px 0 var(--plum)`): buttons only. The 4px plum base under the button is its key travel: on press the button moves down 4px and the base collapses to 0.
- **Meter shade** (`box-shadow: inset 0 -4px 0 var(--green-lo)`): the bottom step on the green meter fill.

### Named Rules
**The Stepped Bevel Rule.** Depth is a 4px light step and a 4px dark step, inset. Every shadow in the system has zero blur and zero horizontal offset.

**The Base Is For Pressing Rule.** Only something that can be pressed carries the outer 4px plum base. Boards, cards and wells never get an outer shadow.

## Shapes

Square. Border radius is 0 on every element; there is no rounded token. Every bordered element uses the same 4px solid plum line, and inner dividers are 4px `board-lo`. The scrollbar inside the crash-notes list is restyled to match: a 12px plum thumb on a `board-lo` track.

The canvas art uses the same language at half the weight. Everything is authored on a 2 px grid in the 360 x 640 world with flat `fillRect` fills, image smoothing off, and `image-rendering: pixelated` on the canvas:
- **Outlines** are 2 px plum (pipes, the ground's top edge, the bird).
- **Curves are stair-steps.** Clouds and bushes are built from one stepped half-disc; the ground stripes slant by stepping 2 px per row.
- **Pipes** are a 2 px plum outline around a green body with a light band near the left edge and a darker band on the right; the cap is 26 px tall and overhangs the shaft by 4 px each side.
- **The bird** is a 16 x 12 cell sprite (32 x 24 world px) with three wing frames. In flight it is drawn at 1.5x (48 x 36) over a deliberately smaller, forgiving hitbox, and it tilts with its speed: nose up while rising, diving when falling. On the title screen it is drawn at 2x. The bird is the one piece of art allowed off the 2 px grid, by scale and by rotation.

**The Drawn In Code Rule.** Art is this project's own drawing, made of rectangles on the 2 px grid. No image files, no sprites from the original game, no anti-aliased vector shapes.

## Components

### Buttons
Chunky slabs that visibly go down when pressed.
- **Shape:** square corners (0), 4px plum border, stepped bevel, 4px plum base.
- **Primary:** `orange` fill, `white` 40px label, padding 8px 20px 12px. Bevel steps are `orange-hi` and `orange-lo`. One per screen: "Let Jev fly", "Fly again", "Try again".
- **Quiet:** `board` fill, `ink` 20px label, padding 8px 12px 10px, tan bevel steps. For the lesser action: "Stop", "Stop Jev", "Forget everything".
- **Hover:** the fill lightens one step (primary to a lighter orange, an untokenized literal in the build; quiet to `board-hi`).
- **Active:** translate down 4px and the plum base collapses, over 80ms ease-out.
- **Focus:** 4px solid `ink` outline, offset 4px.
- **Disabled:** `board-lo` fill, `ink-soft` label, not-allowed cursor; the bevel and base stay so it still reads as a button.

### Boards
The tan reading surfaces beside the playfield.
- **Corner Style:** square.
- **Background:** `board`, with the board bevel.
- **Border:** 4px solid plum.
- **Internal Padding:** 18px 16px 20px. Width 300px.
- **Structure:** a 40px heading, then sections each opened by a 20px `ink-soft` label, then a footer pinned to the bottom for the board's one quiet button.

### Wells
Recessed panels inside a board for content that changes.
- **Style:** `well` fill, 4px plum border, no bevel, padding 8px 10px.
- **Used for:** the "what Jev was told" list, the crash-notes list (scrolls inside itself, entries separated by a 4px `board-lo` rule).

### Stats lists
Two-column lists: label in `ink-soft` on the left, value in `ink` right-aligned, 4px between rows. An empty value is a single hyphen or the words "nothing yet" in `ink-soft`. The game-speed value turns `orange-lo` when the game is running slower than normal.

### Probability meter (signature)
The one chart in the system: Jev's probability for "flap".
- **Track:** 28px tall, `well` fill, 4px plum border.
- **Fill:** flat, from the left, as wide as the percentage. `ink-soft` below the flap line, `green` with a `green-lo` bottom step at or over it.
- **Flap line:** a 4px plum bar at 50% that overshoots the track by 8px above and below.
- **Verdict line beneath:** the percentage at 40px with the word ("flap" or "no flap") beside it at 20px, and the threshold ("flaps at 50%") in `ink-soft` at the right.
- **Motion:** none. The fill jumps to each new answer; it is a reading, not an animation.

### Playfield and curtain
- **Playfield:** the canvas inside a 4px plum border on a `sky` background, overflow hidden.
- **Score:** display type, white with plum outline, centred 5% from the top. It pops on each point (a 180ms settle from 6px up and 1.12 scale).
- **Title state:** lettering straight on the sky (headline, primary button, a hint line), using the outline-on-sky treatment. A message that must be read, such as the missing-key note, sits in a small tan bevelled panel.
- **Card state (paused, crashed):** one tan card with the board's border and bevel, inset 6% each side, placed on whichever half of the field the bird is not in, so the crash stays visible. It rises 20px into place over 220ms.
- **Crash flash:** a `white` wash over the canvas fading out over 160ms.
- **Reduced motion:** the card rise, score pop, button transition, crash flash, title-screen bob and idle wing beat are all turned off.

### Undecided
A strip showing the last 30 or so answers under the probability meter has been proposed and is waiting on the user's decision. It is not built and is not part of this system.

## Do's and Don'ts

### Do:
- **Do** set Jersey 20 only at multiples of 20 px, at weight 400, with `font-synthesis: none`.
- **Do** outline everything in `plum`: 4px solid in the page, 2 px in the canvas art.
- **Do** show depth with the 4px stepped bevel (lighter step inside the top edge, darker step inside the bottom edge).
- **Do** draw new art in code, with flat fills on the 2 px grid of the 360 x 640 world, and build curves from stair-steps.
- **Do** put content on sky, tan or cream, and keep the tan boards the same materials as the arcade scoreboard.
- **Do** keep white outlined type for lettering that sits directly on the playfield, and plain `ink` for type on tan.
- **Do** reserve space for values that change length, so a board does not move while it is being read.
- **Do** honour `prefers-reduced-motion` by removing the movement, as the build does.

### Don't:
- **Don't** use the original game's artwork or trace it. The user chose their own drawing in that style.
- **Don't** build a dark AI-dashboard: no dark panels, no content on `surround`, no glow.
- **Don't** round a corner, blur a shadow or draw a gradient. All three are absent from the build.
- **Don't** use orange for anything but the one primary button, or green in the page for anything but a "flap" answer.
- **Don't** use pure black or pure white; the darks are warm plum-browns and the lightest tint is the warm `white`.
- **Don't** add a second typeface or a bold weight.
- **Don't** give a board, card or well an outer shadow; the plum base belongs to things that press.
- **Don't** animate the probability meter between answers.
