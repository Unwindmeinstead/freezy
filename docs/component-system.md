# Freezy Component System

## Principles

- components should communicate trust first
- visual richness comes from hierarchy and material, not ornament
- each component needs a clear role in the household workflow

## Foundations

### Tokens

- `--canvas`
- `--surface`
- `--surface-strong`
- `--line`
- `--ink`
- `--ink-soft`
- `--ink-muted`
- `--accent`
- `--accent-soft`
- `--fresh`
- `--soon`
- `--urgent`
- `--radius-card`
- `--radius-pill`
- `--shadow-soft`
- `--shadow-strong`

### Typography Tokens

- `--font-display`
- `--font-sans`
- `--font-mono`

## Navigation

### Top Bar

Purpose:

- orient user
- show household/location context
- expose one or two utility actions

Content:

- wordmark
- household or room label
- share / activity action

Behavior:

- sticky
- high blur not required; prefer material surface

### Segmented Location Control

Purpose:

- switch between fridge, freezer, pantry

Rules:

- large enough for thumb use
- active state must change both tone and elevation
- no tiny pill tabs

## Home Components

### Hero Briefing Card

Purpose:

- summarize what matters now

Content:

- greeting or moment-based label
- headline summary
- 2-3 supporting metrics
- primary scan CTA

### Metric Tile

Purpose:

- show compact high-signal household stats

Examples:

- use soon count
- items tracked
- shopping items

### Insight Strip

Purpose:

- surface one useful recommendation

Examples:

- “Use spinach and mushrooms in the next 2 days”
- “You are low on breakfast staples”

## Inventory Components

### Evidence Card

Purpose:

- show last scan image and verification state

Content:

- image
- label
- last scanned time
- confidence or reviewed state

### Category Section

Purpose:

- visually group items without overwhelming borders

Content:

- title
- optional count
- item list

### Inventory Item Row

Purpose:

- present an item with quantity, freshness, and source

Structure:

- icon or small visual marker
- primary name
- secondary metadata
- freshness state
- quick action affordance

## Planning Components

### Use Soon Card

Purpose:

- highlight spoilage risk without alarm fatigue

Content:

- item
- reason
- suggested action

### Recipe Card

Purpose:

- convert inventory into value

Content:

- recipe title
- ingredient match quality
- number of expiring items used
- time estimate

### Shopping Item Row

Purpose:

- show urgency and rationale

Metadata:

- source category such as staple, recipe, or low stock

## Capture Components

### Scan Launcher Sheet

Purpose:

- separate quick photo from guided multi-angle scan

### Camera Overlay

Purpose:

- guide better capture quality

Include:

- framing guidance
- short prompt
- progress when in multi-angle mode

### Analysis Overlay

Purpose:

- make wait time feel intentional and trustworthy

Content:

- concise status
- optional phase language like “Reviewing shelf details”

## Feedback Components

### Status Pill

Purpose:

- lightweight metadata such as reviewed, estimated, synced

Rules:

- use sparingly
- avoid more than 2 on a row

### Toast

Purpose:

- acknowledge actions without stealing focus

Rules:

- short sentence
- disappear automatically
- never carry complex decision-making

## Spacing and Shape

### Spacing Scale

- 8
- 12
- 16
- 20
- 28
- 40

### Radii

- pills: fully rounded
- compact cards: 18px
- major surfaces: 28px

## Component Quality Bar

A component is not ready unless:

- primary action is obvious
- hierarchy is readable at a glance
- metadata is subordinate
- state changes are clear
- it works on mobile without crowding
