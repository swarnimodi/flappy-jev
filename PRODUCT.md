# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain HTML canvas page plus a zero-dependency Node server. Approved by Swarnim in the design round on 6 Oct 2026.

## Users

Swarnim, at his own machine, watching Jev play. Assumption (stated to him, not corrected): this is a first hands-on with Jev, separate from the Calcutta AI Club work.

## Product Purpose

Flappy Bird where TypeSafe's Jev model flies the bird. Success is being able to watch Jev's yes/no answers turn into flight, and to see how fast and how steady Jev is.

## Positioning

Every flap is a yes/no answer from Jev to a situation described in words. Code owns physics, collisions and scoring. Game time waits for Jev, so a slow answer means slow motion and never an unfair crash. Jev's answer to each of the 140 possible situations is remembered for the current crash notes, so a run reaches full speed after a few seconds.

## Capabilities and Constraints

- Jev flies; the space bar lets a person fly instead.
- Jev learns from crashes: each crash becomes a note that is sent back with every later question (chosen by Swarnim over code-side corrections, 6 Oct 2026).
- Shows Jev's last "flap" probability, its response time, the game speed and the score.
- Jev errors pause the game with a message. With no API key, Jev mode is unavailable and manual play still works.
- Jev cannot generate anything and is weak with raw numbers; the game describes each moment in named bands.
- The API key stays on the server and never reaches the browser.

## Evidence on Hand

Recorded flights with the real Jev (jev-1.13.0), 6 Oct 2026, same pipe layout each run, logs in `runs/*-real/`:

- Asked live every step (before answers were remembered): 1, 9+, 4, 9+, 9+, 9+ pipes over six runs capped at 60 s, at about a quarter of normal speed. The first run had no crash note; the rest had one.
- With answers remembered: 1 pipe with no note, then 39+ pipes in 60 s with the note, at normal speed. Later runs in that series reused the same remembered answers, so they are repeats, not new evidence.
- Jev's answers took about 340 ms each from Swarnim's machine.

Not measured: other pipe layouts, and runs longer than 60 s. Do not show invented scores, response times or claims beyond these.

## Product Principles

- Jev's answer is the thing to watch; make each one visible.
- Never blame Jev for the network: lag slows the game, it does not kill the bird.
- Say what is measured and nothing more.
