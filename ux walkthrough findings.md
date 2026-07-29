# UX walkthrough findings

Written 2026-07-28 after a full hands-on pass through every screen in the app
as a real user would meet it: landing → signup/login → dashboard → New
Invitation → design editor (all five tabs) → save → publish → guest page →
RSVP submit → admin gateway → Access DB → 404, in both light and dark mode.

Everything below was checked against the running app, not read off the source.

**Bugs found during this pass were fixed as I went** — they're listed in
section 1 for the record. Sections 2 and 3 are the things I deliberately did
**not** change: preferences, gaps and open questions for you to decide on.

---

## 1. Bugs found and fixed

### 1.1 The editor claimed "Unsaved changes" the moment it opened
Opening any existing invitation immediately showed the "Unsaved changes"
indicator and armed the browser's "Leave site?" warning — before touching
anything. Navigating away from a design you hadn't edited nagged you every
time, which is exactly the kind of false alarm that trains people to click
through real warnings.

The giveaway was that the Undo button was correctly *disabled* at the same
moment — the history stack knew nothing had changed while the dirty flag said
otherwise.

Cause: after loading a saved design, the canvas fired its `onChange` callback
so the parent could fill in the Layers panel. But `onChange` also means "the
sender edited something", so loading a file counted as an edit. Split into a
separate `onReady` callback that populates the panels without marking the
design dirty. Verified: clean on load, still dirty after a real edit, Layers
panel still populates.

### 1.2 Guest RSVP count boxes had no labels
On the guest page, the "Adults" and "Kids" captions above the number boxes
were plain text, not real labels. A screen reader announced two identical
unlabelled spin buttons with no way to tell which was which — so a blind guest
literally could not fill in the form correctly.

Fixed with proper `<label for>` associations. The "Who's coming?" heading also
now names the group as a whole rather than being an orphaned label attached to
nothing. Verified: the boxes now report as "Adults" and "Kids".

### 1.3 Tooltips were cut off at the bottom of the screen
The zoom controls sit near the bottom-right of the editor. Their tooltips
rendered *below* the button, which put them past the bottom edge of the window
(measured: tooltip bottom at 911px in a 900px-tall window), so they were
sliced in half.

`ThemedTooltip` already avoided the left and right edges but never checked the
bottom one. It now flips above the trigger when there isn't room below.
Verified fixed for all three zoom buttons, and verified that tooltips
elsewhere still appear below their trigger as before.

---

## 2. Things that would be better (my recommendations)

Ordered by how much I think you'd feel them.

### 2.1 Guests never see the event details on a designed card — worth a decision
This is the biggest one, and it needs your call rather than my guess.

The Details tab lets you fill in title, host, date, location and description.
For **every other invitation type** those get shown to the guest above the
card. For a **designed card they are shown nowhere at all** — the guest sees
only the canvas and then the RSVP form.

So if you design a beautiful card but don't manually add a text box saying
when and where it is, your guests are never told when and where it is. They
just get a pretty picture and a form.

I know this was a deliberate call ("metadata only, separate from canvas") and
I haven't changed it. But two things make it worth revisiting:

- Your own landing page promises *"add the essentials — time, place, host —
  and we'll turn it into a shareable link"*. Right now that promise is only
  kept for uploaded cards, not designed ones.
- From the sender's side, the Details tab looks broken. You type in a date, and
  nothing anywhere ever shows it.

Three options, roughly in order of how much work they are:
1. Show the details underneath the card on the guest page, same as every other
   type. Smallest change, keeps the canvas untouched.
2. Offer a one-click "Add these to my card" button in the Details tab that
   drops real text objects onto the canvas — stays true to "templates are a
   starting point, not a cage", since they'd be ordinary elements afterwards.
3. Leave as-is, but relabel the Details tab so it's obvious these are for your
   own records and the dashboard, not for guests.

### 2.2 The sender dashboard "Overview" is nearly empty
Logging in lands you on a page with a heading, one sentence, and a link.
Roughly 85% of the screen is blank. It's the first thing you see every single
time you sign in, and it tells you nothing.

Obvious things it could show: how many invitations you have, how many are
still drafts, total RSVPs so far, your next upcoming event, and the two or
three most recent responses.

### 2.3 The admin gateway is completely blank once you're logged in
Logged out, `/` shows the login card. Logged in, the whole main area is empty
— just a sidebar next to a large pink void. Even a heading and a couple of
"users / invitations / RSVPs" counts would stop it looking broken.

### 2.4 The invitation gallery shows a placeholder for everything
Every card in "Pick Up Where You Left Off" shows the same grey
broken-image icon unless you uploaded your own card image. A designed card
shows a placeholder even though we have everything needed to draw a real
thumbnail of it (the same read-only canvas the guest page uses).

The point of a visual gallery is recognising your invitation at a glance, and
right now every tile looks identical. Also missing from the tiles: what kind
of invitation it is, and whether it's published or still a draft. (You can
currently only infer "draft" from the *absence* of a copy-link button.)

### 2.5 Every page's browser tab just says "RSVP"
Including the guest page. If someone opens three invitations, they get three
identical tabs. The guest page in particular should use the event's own title.

### 2.6 The RSVP confirmation is very bare
After submitting you get "Thanks, Test Guest! Your RSVP has been recorded."
It doesn't repeat back what you actually said (attending, 2 adults + 1 kid),
and there's no way to correct a mistake. Even read-only confirmation of the
numbers would reduce "wait, did that go through?" anxiety.

### 2.7 The card could use more of the screen in the editor
The card is capped at 576px wide even when there's roughly 1120×900 of empty
space around it. It could comfortably be much larger before anything else has
to move.

### 2.8 Colour preset names are truncated
In the Style tab: "Elega…", "Classi…", "Midnig…". The swatch tiles are
narrower than the names they carry.

---

## 3. Smaller notes

- **`/create/link` and `/create/template` are genuinely dead.** Both work, but
  the landing page and the New Invitation modal have *both* settled on the same
  two flows (design in our editor / bring your own card), so nothing points at
  them. They're also the last files using raw Tailwind colours instead of the
  theme variables. Decide: wire in, or delete.
- **Home and End don't move the cursor** when editing text on the canvas.
  Fabric doesn't bind them. Arrow keys, Ctrl+A and shift-selection all work.
- **Scratch test data is still in the dev database** — roughly 15 users and
  25+ invitations from automated runs, including deliberately absurd entries
  (a 200-character invitation title, a ~110-character user name, usernames
  like `a`, `asdf`, `pct424480%`). Worth clearing when you're ready; I haven't
  touched it because deleting rows is your call.
- The Next.js dev-tools badge overlaps the "Create Invitation" and "Log Out"
  buttons in the bottom-left. That's Next's own dev overlay and disappears in
  a production build — not an app bug.

---

## 4. Verified working — no action needed

Checked properly rather than glanced at:

- **Snapping**: guide lines appear mid-drag against both the card's own centre
  line and other elements' edges. It genuinely snaps, not just draws — I
  released a drag 7 card-pixels off centre and it saved at *exactly* centre.
- **Per-character text styling**: selecting part of a sentence and pressing
  Ctrl+B/I/U styles only that part, saves as ranges, and renders identically on
  the guest page.
- **Zoom**: 100% → 156% → reset, with the canvas element staying exactly the
  same size throughout, so nothing is being rescaled behind the scenes. This
  was the specific risk you flagged, and it's clean.
- **Long values don't break layouts**: a 200-character invitation title in the
  gallery and a ~110-character name in Access DB both truncate properly with no
  horizontal overflow.
- **Dark mode**: the surrounding app goes dark while the card keeps the colours
  the sender chose, which is the right call — a guest's theme shouldn't repaint
  someone else's invitation.
- **Accessibility names**: every button and link on every page tested has one.
- **404 page**, publish flow, guest RSVP submission and its confirmation (the
  card stays on screen underneath it), Access DB sorting/filtering/truncation.

---

## 5. One testing trap worth knowing about

A hidden or background browser tab makes the editor *look* broken: the card
renders at full size and hangs off the top and bottom of the window. Nothing is
actually wrong. Browsers suspend both `requestAnimationFrame` and — less
obviously — `ResizeObserver` for tabs that aren't visible, and the canvas
relies on `ResizeObserver` to size itself to its container.

If the card ever looks like it's overflowing during automated testing, check
the tab is actually visible before assuming it's a layout bug. This cost real
time this session and is now recorded in repository memory.
