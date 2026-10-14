# Screen-reader session (C13)

One session is one data point. Label the result "screen-reader session, <reader> + <browser>", never "accessible".

## Before you start (2 minutes)

- Reader and version (NVDA, free for Windows; or Windows Narrator): ______
- Browser and version (Chrome or Firefox): ______
- Page opened from: live claude.ai viewer / local file / other: ______
- Date: ______
- Turn the reader's speech viewer on if it has one (NVDA: Tools, Speech viewer). It gives you a text record of what was announced.

## Part 1: Tab only (about 15 minutes)

Use Tab, Shift+Tab, Enter, Space and arrow keys only. No mouse.

1. From the top of the page, Tab through everything. Note anything you reach that is not announced with a name and a role.
2. Note anything announced twice, announced in a confusing order, or visible on screen but never reached by Tab.
3. Check that the focus ring is visible at every stop (the page uses a 3px ring with a 2px offset).

## Part 2: Headings and landmarks (about 10 minutes)

NVDA: H for next heading, D for next landmark, Insert+F7 for the elements list. Narrator: its heading and landmark commands.

1. Do the headings give a usable outline of the wizard steps?
2. Are the main regions (navigation or steps, main content, results) reachable as landmarks?

## Part 3: The main path (about 30 minutes)

Walk it once, start to finish, and write what was announced at each step.

| Step | What to do | What I expected | What was announced | Problem? |
| --- | --- | --- | --- | --- |
| 1 | Choose a seed color (type a hex and, separately, use the descriptor words) | | | |
| 2 | Move to the palette | | | |
| 3 | Read a contrast result for one role pair | | | |
| 4 | Find a failing pair and use its suggested fix or the override | | | |
| 5 | Change a value and watch for an announced update | | | |
| 6 | Reach the Export step and trigger one download | | | |
| 7 | Try an export while a failure is unresolved (it should be blocked) and read the message | | | |
| 8 | Save or open a project file | | | |

## Findings

One line per problem. Fields: step, what happened, what should have happened, reader + browser.

| # | Step | What happened | What should happen | Reader + browser |
| --- | --- | --- | --- | --- |
| 1 | | | | |

## Session 1: NVDA 2026.2 + Firefox 157.0 (2026-10-01)

Run by Kwade. Label this result "screen-reader session, NVDA 2026.2 + Firefox 157.0", never "accessible". The artifact was opened in its own new browser tab; whether the claude.ai viewer frame was around it was not recorded. This was Firefox, not Chrome.

**Part 1, Tab only.** Moving into the artifact and through the elements worked. Tab did not cycle through the six step tabs, although it did move between elements within each step. The arrow keys did not work (C18).

**Part 2, headings and landmarks.** H did not move to headings on the artifact; on pages without headings NVDA gave its "no next heading" message. D (landmarks) worked (C20).

**Part 3, main path.**

| Step | What was reported | Problem? |
| --- | --- | --- |
| 1 Choose a seed | Typed a color and used it; announcements followed the elements entered or chosen. The descriptor-words path was not reported. | Using the color did not advance to Analyze; may be by design (C19) |
| 2 Move to the palette | Not reported separately; there is no forward button after Analyze, Supporting colors or Palette and roles, and switching steps from the bottom of a step meant tabbing back through everything | Yes (C19) |
| 3 Read a contrast result | Not reported | |
| 4 Failing pair and override | Override with the instructed color; the "Export blocked" alert was received | No |
| 5 Announced update after a change | Not reported | |
| 6 One download | Save prompts worked as expected after the failure was cleared | No |
| 7 Export while a failure is unresolved | All export buttons were grayed out as expected, then enabled once cleared | No |
| 8 Save or open a project | Not reported | |

**Overall (Kwade).** It seems to have worked. Navigation sometimes followed columns rather than rows, so the order could seem off (C21). Switching between steps could be a struggle, since the step bar is only at the top (C19). A lot of copy has to be read (C21).

**Findings table.**

| # | Step | What happened | What should happen | Reader + browser | Item |
| --- | --- | --- | --- | --- | --- |
| 1 | Step bar | Tab did not cycle through the six step tabs; arrow keys did nothing | The step bar should be operable by keyboard in the way its tab roles promise | NVDA 2026.2 + Firefox 157.0 | C18 |
| 2 | Steps 2 to 5 | No button to go to the next step; hard to tell a step is finished | A clear way to continue, and to go back | NVDA 2026.2 + Firefox 157.0 | C19 |
| 3 | Headings | H did not move to a heading | H moves to the next heading | NVDA 2026.2 + Firefox 157.0 | C20 |
| 4 | All steps | A lot of text to read; reading order sometimes by column | Shorter or foldable help text; a sensible reading order | NVDA 2026.2 + Firefox 157.0 | C21 |

## After the session

- Paste the findings table into this file, or send it to Claude and ask for it to be recorded.
- Each finding becomes a line in `TO-CONFIRM.md` (type Fix) until it is repaired and re-tested.
- Update C13 in `TO-CONFIRM.md` with the date and what was tried. Do not close it: the browsers and readers not tried stay untested.
