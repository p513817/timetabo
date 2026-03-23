# Appointment Calendar Widget Spec

## 1. Overview
Build a small appointment-schedule generator for beauty professionals (for example nail artists and hairstylists).
The app should let a user:
- open a mini calendar
- click one or more dates
- choose available time slots for each date
- export a transparent-background schedule image suitable for posting
- export Google Calendar import files (`.ics`)

This spec is intentionally phased so the project can ship quickly and expand safely.

---

## 2. Product Goals

### Primary goal
Help a service provider generate a clean visual availability schedule quickly.

### Secondary goal
Allow the same selected schedule to be exported as machine-readable calendar data.

### Non-goals for the first version
- No Google login in Phase 1
- No direct Google Calendar API sync in Phase 1
- No multi-user collaboration in Phase 1
- No backend database in Phase 1
- No customer booking portal in Phase 1

---

## 3. Target Users
- Nail artists
- Hairstylists
- Lash artists
- Solo appointment-based service providers

---

## 4. Phase Plan

## Phase 1 — Static MVP
### Scope
- Single-page static web app
- Month calendar view
- Click a date to configure available time slots
- Simple preset time slots + custom slot entry
- Preview schedule card
- Export transparent PNG
- Export `.ics`
- Save/load config using browser localStorage

### Success criteria
- A non-technical user can generate one monthly schedule image in under 3 minutes.
- Exported PNG has transparent background.
- Exported `.ics` imports into Google Calendar.

### Explicit constraints
- Entire app must run on static hosting
- No server required
- No secrets stored in frontend

---

## Phase 2 — Better Templates and UX
### Scope
- Multiple visual templates
- Brand color / font size controls
- Weekly and monthly views
- Batch slot editing
- Duplicate last week's availability
- Mobile-first layout polish
- SVG export in addition to PNG

---

## Phase 3 — Google Integration
### Scope
- Google sign-in
- Optional direct event creation in Google Calendar
- Optional import from existing calendar data
- Permission-aware OAuth flow

### Notes
- This phase may still be frontend-heavy, but security and OAuth configuration must be handled carefully.
- Consider introducing a lightweight backend if token handling, user accounts, auditing, or shared workspaces are required.

---

## 5. Recommended Stack

### Phase 1 recommended stack
- Framework: React + TypeScript + Vite
- Styling: Tailwind CSS
- Date utilities: dayjs
- Calendar UI: custom lightweight monthly grid or FullCalendar if needed
- State: React state + localStorage persistence
- Image export: SVG-first rendering, optional canvas conversion for PNG
- ICS export: generate text file in-browser
- Hosting: GitHub Pages / Cloudflare Pages / Vercel static deployment

### Why SVG-first
- Transparent background is simpler and more predictable
- Text and lines stay crisp
- Easier to support multiple export sizes later

---

## 6. Functional Requirements

## 6.1 Calendar Interaction
- User can navigate month by month
- User can click a date cell to open slot editor
- User can mark date as:
  - available
  - unavailable
  - custom slots
- User can copy one day's slots to other dates

## 6.2 Slot Editing
Each date can contain zero or more appointment slots.

A slot contains:
- start time
- end time
- optional label
- optional status (`available`, `booked`, `break`, `closed`)

Validation rules:
- end time must be later than start time
- overlapping slots are not allowed unless explicitly supported later
- slot values should be normalized to local timezone

## 6.3 Schedule Preview
- Preview updates immediately after edits
- User can choose display mode:
  - monthly overview
  - selected dates list
- User can toggle what appears in export:
  - title
  - month label
  - service name
  - contact handle
  - legend

## 6.4 PNG Export
- Export transparent PNG
- User can choose aspect ratio / output preset:
  - square post
  - portrait story
  - A4-ish portrait
- Export must preserve transparency outside content
- Export filename example:
  - `appointments-2026-04.png`

## 6.5 ICS Export
- Export selected slots as one `.ics` file
- Each slot becomes one event
- Event fields:
  - `UID`
  - `DTSTAMP`
  - `DTSTART`
  - `DTEND`
  - `SUMMARY`
  - `DESCRIPTION` (optional)
  - `LOCATION` (optional)
- Download filename example:
  - `appointments-2026-04.ics`

Important product choice:
- In Phase 1, exported ICS should represent availability blocks, not confirmed customer bookings.
- Default event summary example:
  - `Available for appointment`

---

## 7. Data Model

```ts
export type SlotStatus = 'available' | 'booked' | 'break' | 'closed';

export interface AppointmentSlot {
  id: string;
  start: string; // "09:00"
  end: string;   // "10:30"
  label?: string;
  status: SlotStatus;
}

export interface DaySchedule {
  date: string; // "2026-04-18"
  enabled: boolean;
  slots: AppointmentSlot[];
  note?: string;
}

export interface ExportStyleConfig {
  themeName: string;
  title: string;
  subtitle?: string;
  contactText?: string;
  showLegend: boolean;
  preset: 'square' | 'story' | 'portrait';
}

export interface AppState {
  timezone: string;
  month: string; // "2026-04"
  schedules: Record<string, DaySchedule>;
  exportStyle: ExportStyleConfig;
}
```

---

## 8. Local Storage Requirements
Store user work in localStorage.

Suggested key:
- `appointment-calendar-widget:v1`

Behavior:
- Auto-save after every meaningful change
- Load automatically on refresh
- Provide "Reset all" action
- Provide JSON backup export/import in a later minor release

---

## 9. Export Requirements

## 9.1 SVG Rendering Layer
Build one renderer that takes normalized app state and produces SVG markup.

Renderer responsibilities:
- layout title area
- layout date cells or slot list
- render transparent background by default
- support theme variables
- avoid framework-specific logic inside layout code

Suggested architecture:
- `src/lib/renderScheduleSvg.ts`
- `src/lib/exportPng.ts`
- `src/lib/exportIcs.ts`

## 9.2 PNG Export Flow
1. Generate SVG string
2. Create blob URL
3. Draw SVG onto canvas
4. Export canvas to PNG
5. Trigger download

## 9.3 ICS Export Flow
1. Convert selected slot data to local datetime values
2. Build valid iCalendar text
3. Create blob
4. Trigger `.ics` download

---

## 10. UX Requirements
- Fast and obvious interactions
- Minimal clicks for common workflow
- Good mobile support
- Large touch targets on calendar cells
- Time slot editor should not feel like spreadsheet software

Suggested default workflow:
1. Select month
2. Click one date
3. Add default time blocks
4. Copy to similar dates
5. Preview output
6. Export PNG or ICS

---

## 11. Error Handling
- Show validation error for invalid time range
- Show warning for overlapping slots
- Show warning when exporting empty month
- If PNG export fails, allow SVG download fallback
- If ICS export fails, show raw debug data in dev mode only

---

## 12. Accessibility
- Calendar cells should be keyboard reachable
- Buttons and controls must have accessible labels
- Export actions should be screen-reader friendly
- Color should not be the only signal for status

---

## 13. Security Constraints
Phase 1 is static-only, so:
- no API keys in frontend
- no Google OAuth secrets in repo
- no customer personal data storage by default
- keep all data local in browser unless user explicitly exports it

For Phase 3:
- use least-privilege OAuth scopes
- clearly explain what calendar permissions are requested
- never expose secrets in client bundle

---

## 14. Folder Structure Suggestion

```text
src/
  components/
    CalendarGrid.tsx
    SlotEditor.tsx
    PreviewPanel.tsx
    ExportPanel.tsx
    ThemeControls.tsx
  lib/
    date.ts
    localStorage.ts
    renderScheduleSvg.ts
    exportPng.ts
    exportIcs.ts
    validators.ts
  types/
    schedule.ts
  app/
    App.tsx
    initialState.ts
```

---

## 15. Milestones

### Milestone 1
- Project scaffolded
- Calendar renders current month
- Date click selection works

### Milestone 2
- Slot editor works
- Local state persists
- Basic preview works

### Milestone 3
- SVG renderer works
- Transparent PNG export works

### Milestone 4
- ICS export works
- Validation and polish complete

### Milestone 5
- Deploy to static hosting
- Add README with screenshots and usage

---

## 16. Acceptance Tests

### A. Basic schedule creation
- Given a fresh app
- When the user selects a date and adds `10:00-12:00`
- Then the preview shows that date and slot

### B. PNG export
- Given at least one configured date
- When the user clicks export PNG
- Then a PNG file downloads
- And the background is transparent

### C. ICS export
- Given at least one configured slot
- When the user clicks export ICS
- Then a valid `.ics` file downloads
- And Google Calendar can import it successfully

### D. Persistence
- Given existing schedule edits
- When the page reloads
- Then the schedule remains available from localStorage

---

## 17. Nice-to-Have Backlog
- Repeating weekly rules
- Holiday presets
- Chinese and English localization
- QR code contact block
- Shareable URL state encoding
- Print layout template
- Import from CSV
- Google Calendar one-click sync

---

## 18. Implementation Notes for Codex
When implementing this spec, prioritize in this order:
1. data model correctness
2. calendar date selection
3. slot editing validation
4. SVG preview generation
5. PNG export
6. ICS export
7. UI polish

Do not begin with animation or visual polish.
Do not add backend code in Phase 1.
Keep utilities pure where possible.
Write unit-testable logic for:
- slot validation
- date normalization
- ICS generation
- SVG generation

