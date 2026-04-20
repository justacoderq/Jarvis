# JARVIS Productivity & Workflow Feature Plan

This document defines the feature set for positioning JARVIS under the `AI for Productivity & Workflow` track.

## Product Framing

JARVIS is a mobile workflow agent that turns natural-language intent, device context, incoming notifications, and wellness signals into actionable flows.

It combines:

- `Siri2` for rooted Android command execution, notification triage, and scheduling
- `PhonePilot` for ADB-based multi-step device control
- `JiggleWiggle` for movement, posture, and micro-break guidance
- `JARVIS Mobile` as the user-facing orchestration layer

## Core Productivity Story

The project improves productivity by reducing:

- app switching
- notification overload
- multi-step phone friction
- context loss during work sessions
- fatigue from long sedentary focus periods

## Feature Set

### 1. Daily Briefing

Give the user an AI-generated summary of:

- backend readiness
- recent notification triage decisions
- scheduler activity
- next recommended action
- a suggested JiggleWiggle movement break

### 2. Notification Inbox and Triage Surface

Expose Siri2 notification intelligence directly in the mobile app:

- watcher running state
- recent notification decisions
- app package source
- action type such as `ignore`, `log`, `alert`, `act`, or `error`
- reason for each decision

### 3. Focus Mode

Add a work-session mode that:

- marks the user as in a focused workflow state
- tracks elapsed focus time
- creates break reminders
- recommends a micro-break after sustained work

### 4. JiggleWiggle Micro-Break Integration

Treat JiggleWiggle as a productivity feature instead of a separate fitness demo:

- generate a short desk/stretch/mobility recommendation
- suggest routines based on focus fatigue
- provide a one-tap entry into JiggleWiggle from JARVIS

### 5. Workflow Command Layer

Support explicit productivity commands such as:

- `brief me`
- `start focus mode`
- `show recent notification actions`
- `suggest a 3 minute break`

## Implementation Scope For This Pass

This implementation pass will add:

- a mobile productivity panel
- a daily briefing generator
- notification log and watcher visibility
- focus mode with timed micro-break prompts
- a simple JiggleWiggle productivity API for micro-break generation

## Deferred / Stretch Features

These are intentionally deferred:

- full calendar integration
- automatic email summarization
- auto-reply workflows
- app-level DND controls
- persistent productivity analytics across sessions

## Submission Positioning

JARVIS should be described as:

`An AI mobile workflow copilot that triages notifications, executes device tasks, keeps users in focus mode, and uses intelligent movement breaks to sustain performance.`
