## Lady Linux UI Branding & Accessibility Design Guidelines

### Purpose

Lady Linux is a teaching-focused operating system that empowers users to manage data, devices, and digital identity while providing a warm, approachable experience. 

A central goal of Lady Linux is equal access: the OS should be usable and enjoyable for people who are blind, low-vision, deaf, hard of hearing, mobility-impaired, neurodivergent, or otherwise disabled.

This document outlines design principles and UI standards that connect Lady Linux’s light/illumination branding with accessibility-first UI practices.

---

### Brand Theme Overview

Lady Linux branding revolves around illumination and clarity, with each release represented by a guiding light (Lantern, Spark, Glow). These elements inform the UI’s color, mood, and accessibility choices.

<strong>Release 1: Spark</strong>

* Color Palette: Bright yellows (#FFF44F), vivid oranges (#FF914D), dark contrast gray (#2B2B2B)
* Mood: Curiosity, beginnings, motivation
* Application: Notification accents use spark highlights; focus rings “spark” with a subtle pulsing effect for clarity without distraction.

<strong>Proposed Release 2: Candle </strong>

* Color Palette: Warm ambers (#FFB347), soft golds (#FFD580), neutral grays (#F5F5F5)
* Mood: Guidance, warmth, gentle entryway
* Application: Default system icons use warm glow edges; accessible focus indicators are golden or bold white outlines.

<strong>Proposed Release 3: Lantern</strong>

* Color Palette: Soft teals (#00CED1), mint greens (#98FF98), night-sky navy (#001F3F)
* Mood: Calm persistence, steady support
* Application: Dark mode defaults to navy/mint contrast for comfortable low-light readability.

---

### Accessibility Principles

<strong>Color Contrast</strong>

* Minimum WCAG 2.1 AA contrast ratio (4.5:1 for normal text, 3:1 for large text).
* Accent colors (from releases) must always be paired with sufficient dark or light backdrops for readability.
* Provide both light mode and dark mode for all themes.

<strong>Scalable Typography</strong>

* Default font: Sans-serif, modern, humanist style (e.g., Noto Sans, Ubuntu, Inter).
* Font must scale from 12px to 200% without breaking layout.
* Headings must be semantically marked up (H1-H6) for screen readers.

<strong>Icons and Symbols</strong>

* Use line + fill icons with high-contrast stroke.
* All icons must include text labels or ARIA alt text for screen reader compatibility.
* Avoid using color alone to convey meaning (e.g., error = red plus alert icon + text).

<strong>Controls and Buttons</strong>

* Hit target minimum: 44px x 44px (per WCAG).
* Provide visible focus indicators (highlighted borders, color inversion, or subtle glow).
* All controls must be usable by:
  * Mouse/trackpad
  * Keyboard (Tab navigation, Enter/Space activation)
  * Voice input

<strong>Voice and Audio</strong>

* OS-wide voice command support for navigation and text entry.
* Screen reader integration (Orca, Speakup, or a built-in assistant tied to the Lady LLM).
* All auditory alerts must have visual equivalents (banners, vibrations, or text).

<strong>Animations & Transitions</strong>

* Animations must be subtle and optional.
* Provide system setting: “Reduce motion.”
* Default transitions: soft fades, gentle glow effects—no flashing or rapid movement (avoids seizure risk).

---

### Applying Release Themes to UI Elements

<strong>Example: Release 1 (Spark)</strong>

* <strong>Buttons: </strong>Compact, bright highlight outline, subtle pulsing glow when focused.
* <strong>Dialogs: </strong>Black/dark backdrop with spark-orange accents.
* <strong>Accessibility: </strong>Clear focus indicators, keyboard-first navigation.

<strong>Example: Release 2 (Flame)</strong>

- <strong>Buttons: </strong>Rounded with teal glow border, background soft navy.
- <strong>Dialogs: </strong>Calm, muted color transitions, optimized for dark mode readability.
- <strong>Accessibility: </strong>Extra emphasis on low-light legibility, reduced eye strain.

<strong>Example: Release 3 (Lantern)</strong>

* <strong>Buttons: </strong>Rounded, warm amber glow hover state, bold white text.
* <strong>Dialogs: </strong>Soft golden highlights around window edges.
* <strong>Accessibility: </strong>High-contrast toggle ensures text on amber backgrounds flips to dark gray.

--- 

### User Customization

Lady Linux must balance a strong brand identity with freedom for users:

* <strong>Themes: </strong>Offer system-wide light/dark variants and high-contrast mode.
* <strong>Playful Options: </strong>Puppies, rainbows, clouds, etc., as optional themes, never defaults.
* <strong>Respectful Defaults: </strong>Branding avoids gender-stereotyped palettes, but playful/self-expression themes are supported for personalization.

--- 

### Governance

No direct imagery of a “lady.” The Lady is present as a voice, guide, and presence—not a pictured figure.

* <strong>Inclusive Imagery: </strong>Use abstract representations of light, guidance, and clarity.
* <strong>Community Contribution: </strong>All contributed icons, wallpapers, or themes must pass accessibility checks before inclusion.

--- 

✅ Lady Linux branding = light + clarity while accessibility = everyone included by design.
