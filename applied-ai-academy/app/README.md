# AI Foundations Handbook (interactive edition)

Applied AI Academy, Level 01. A learner-facing web app for Chapter 01, *Understanding Artificial Intelligence*, with the corrections from `../level-01/chapter-01/editorial-review-v1.md` applied.

## Files

- `handbook.html`: the source. All lesson text sits in `<template id="t-lesson-1-X">` blocks near the top. Quiz questions, the glossary, the timeline and the references are data arrays in the `<script>` block.
- `build.sh`: wraps `handbook.html` into a standalone `index.html`. Run it after every edit.
- `index.html`: generated. Open it directly in a browser, or host it anywhere static.

## Run locally

```bash
./build.sh && python3 -m http.server 8080
```

Then open http://localhost:8080/.

## Features

- 8 lessons, key takeaways and a 30-mark assessment. Section A is auto-marked; Sections B and C are self-marked against a marking guide. A completion record unlocks at 70%.
- "Check your understanding" questions with explanations at the end of every lesson.
- Labs: *Is it AI?* sorting, *Your AI day* audit, and *Catch the errors* (the CHECK routine).
- An interactive, filterable AI timeline, plus SVG diagrams that follow the light and dark themes.
- Tap-to-define glossary terms, a searchable glossary, references, and evidence labels (Established / Debated / Emerging).
- Progress is saved in the learner's browser only (localStorage). There are no accounts and nothing is sent to a server.

## Before wider release

Check the bibliographic details marked ◐ in the editorial review against the originals. Review the South African policy sidebar (Lesson 1.8) at every update.
