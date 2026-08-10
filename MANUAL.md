# Bekfontein Farm Notebook - User & Admin Manual

A private, two-person app for Andre to capture farm knowledge - procedures,
equipment quirks, seasonal timing, anything worth handing over - so his son
has it all in one place later. It is a completely separate app from
Laughing Waters Harvesting: its own server process, its own port, its own
database. Nothing here talks to that app.

## Table of Contents

1. [Overview & Concepts](#1-overview--concepts)
2. [Initial Server Setup](#2-initial-server-setup)
3. [Device Setup (iPhone)](#3-device-setup-iphone)
   - [This app's address](#this-apps-address)
4. [Using the App](#4-using-the-app)
5. [How Offline Capture Works](#5-how-offline-capture-works)
6. [Backups & Restore](#6-backups--restore)
7. [Troubleshooting / FAQ](#7-troubleshooting--faq)

Annexe A: [Data Field Reference](#annexe-a-data-field-reference)

---

## 1. Overview & Concepts

### The two accounts

- **andre** (role: *recorder*) - can create, edit, and archive entries.
- **son** (role: *viewer*) - can browse and search everything Andre has
  recorded, but can't create, edit, or delete anything. This is enforced by
  the server itself, not just hidden buttons - even a direct API request
  from the viewer account gets rejected.

Both start with the password `ChangeMe123!` - change it under the
**Settings** tab the first time you log in (see
[Changing the default passwords](#changing-the-default-passwords) below).

### No audio is ever stored

Andre doesn't record voice notes in the sense of an audio file. He taps the
**microphone key on his iPhone's own keyboard** and dictates straight into
the Notes field, using Apple's built-in dictation (which handles both
Afrikaans and South African English). The app only ever sees and stores the
resulting **text** - there is no audio file anywhere, no transcription
service, and no recording of any kind.

### What an entry is

Title + notes (the dictated text) + an optional Block/Location + any number
of photos, taken with the phone's own camera + free-form tags Andre defines
as he goes. Every entry remembers who wrote it and when.

### Why capture is offline-first

Andre will often be out on the farm with patchy or no signal. Saving an
entry always writes to the phone first, instantly, whether or not there's a
connection - it syncs to the server automatically in the background once
signal returns. Nothing is ever lost waiting for a connection. See
[chapter 5](#5-how-offline-capture-works) for exactly how this works and
what to watch for.

---

## 2. Initial Server Setup

This app runs as a **second, independent process on the same PC** as
Laughing Waters Harvesting, if that's already set up on this machine. It
does not share a port, a database, or a Scheduled Task with that app - the
two can be stopped, started, and updated completely independently.

### Prerequisites

- Windows 10/11 PC (or Mac/Linux, run manually - see the harvest app's
  manual for the equivalent non-Windows steps, which apply identically
  here).
- The PC stays on and connected to the network whenever Andre or his son
  need to reach the app.
- Internet access for the one-time setup (downloading Python and
  dependencies) and for pulling future updates via `update_server.bat`.

### Quick setup: the automated installer (recommended)

1. Get this folder onto the server PC (clone via git, or copy as a zip -
   whichever this repo's GitHub remote makes easiest).
2. Double-click **`install.bat`**.
3. Approve the Windows "Do you want to allow this app..." prompt (User
   Account Control) - the installer needs administrator rights once to
   register the Scheduled Task and firewall rule.
4. Wait for it to finish - it installs Python if needed, creates the app's
   virtual environment, installs dependencies, opens the firewall for the
   app's port, and registers a Scheduled Task ("Bekfontein Farm Notebook
   Server") so the server starts automatically every time the PC boots, with
   no one needing to be logged in.
5. It prints the address to use, e.g. `http://<this-pc's-IP>:8001/app/`.

Safe to re-run any time - each step checks what's already done and skips it.

### Stopping, starting, and restarting the server

Same mechanism as the harvest app, just a different task name:

```powershell
schtasks /end /tn "Bekfontein Farm Notebook Server"
schtasks /run /tn "Bekfontein Farm Notebook Server"
```

### Pulling future updates

Double-click **`update_server.bat`**. It pulls the latest code from this
app's own GitHub repo, installs any new dependencies, and restarts the
server - one step, same pattern as the harvest app's updater.

### Tailscale HTTPS (required for the installable offline app)

Unlike the harvest app (which only needs HTTPS for its camera QR scanner),
this app needs HTTPS for a different reason: **installing the app to the
Home Screen and registering its offline service worker both require a
secure context** (HTTPS, or `localhost`) - a plain `http://192.168.x.x:8001/`
address will let Andre log in and use the app in a browser tab, but it will
silently fail to install as an app icon or work offline, which defeats the
entire point of this app for someone walking the farm without signal.

If Tailscale is already set up on this server for the harvest app, reuse it
- just add a second mapping for this app's own port:

```bash
tailscale serve --bg --https=443 http://localhost:8001
```

(Tailscale can only bind one thing to port 443 externally per hostname; if
the harvest app already claims `:443`, use a distinct Tailscale hostname or
port for this app - run `tailscale serve status` to see what's already
mapped, and `tailscale serve --https=8443 http://localhost:8001` as an
alternative if needed.) Find the exact address with `tailscale status` - it
looks like `https://<server-name>.<tailnet-name>.ts.net/`.

**On this farm's server the harvest app holds the default port, so this app
lives on `:8443`.** `tailscale serve status` shows both mappings, and the one
proxying to `http://localhost:8001` is this app:

```
$ tailscale serve status
https://<server-name>.<tailnet-name>.ts.net (tailnet only)
|-- / proxy http://localhost:8000          <- harvest app

https://<server-name>.<tailnet-name>.ts.net:8443 (tailnet only)
|-- / proxy http://localhost:8001          <- this app
```

which makes this app's address
`https://<server-name>.<tailnet-name>.ts.net:8443/app/`, filling in the real
server and tailnet names from that output - see
[chapter 3](#this-apps-address).

If Tailscale isn't set up on this server yet, see the harvest app's
`MANUAL.md` chapter 2, section "Connecting external users with Tailscale" -
the setup steps are identical, this app just needs its own `tailscale serve`
line pointed at port 8001 instead of 8000.

### Changing the default passwords

Log in as each account and go to the **Settings** tab: enter the current
password (`ChangeMe123!` the first time) and a new password twice, then
**Save New Password**. Do this once for `andre` and once for `son` - each
account only changes its own password while logged in as that account.

Since the app is only reachable at all by devices on the farm's own
network or the shared Tailscale tailnet, this is a smaller risk than an
app open to the public internet - but it's still worth doing once, soon
after setup.

---

## 3. Device Setup (iPhone)

### Install to Home Screen *before* first use - this matters

**⚠️ Do this before Andre records anything.** If he captures entries in a
plain Safari tab and *then* adds the app to his Home Screen, iOS treats the
installed app as a completely separate storage area from the Safari tab it
came from - anything captured before installing can appear to have
"vanished" when he switches to the Home Screen icon (it's still sitting in
Safari's own storage, just invisible from the installed app). Avoid this
entirely by installing first, then always opening the app from its Home
Screen icon.

### This app's address

```
https://<server-name>.<tailnet-name>.ts.net:8443/app/
```

**Both accounts use this same address** - Andre and his son open the identical
link and simply sign in with different usernames. There is no separate address
for the son: the read-only restriction lives on his account and is enforced by
the server, so a different URL would neither add nor remove anything.

Three parts of that address matter, and getting any of them wrong fails in a
way that doesn't look like an address problem:

- **`:8443`** - the farm server also runs the harvest app, which holds the
  default port. `https://<server-name>.<tailnet-name>.ts.net` without the port
  opens the *harvest* app, not this one.
- **`/app/`** - without it the server answers 404.
- **`https`** - a plain `http://192.168.x.x:8001/app/` LAN address still lets
  him log in, but iOS silently refuses to install it to the Home Screen, run
  it offline, open the camera, or record a note's location. Everything that
  makes this app worth carrying into the orchard needs the HTTPS address.

Both mappings are **tailnet only**, so a phone must be signed in to the
Tailscale network to reach either. If the address ever changes, re-check it on
the server with `tailscale serve status` - the line proxying to
`http://localhost:8001` is this app.

**Steps:**
1. Open the address above in Safari on the iPhone.
2. Log in as `andre` (or `son`).
3. Tap the **Share** icon (square with an arrow) → **"Add to Home Screen"**.
4. From now on, always open **Bekfontein Farm Notebook** from the Home
   Screen icon, not from a Safari bookmark or tab.

### Dictation

Tap the Notes field, then tap the **microphone icon** on the iOS keyboard
(next to the space bar) to dictate in Afrikaans or English - iOS auto-
detects or can be set per-keyboard under Settings → General → Keyboard →
Keyboards, if it's not picking up the right language. Tap the keyboard icon
again (or tap "Done") to stop dictating and review/edit the text normally.

### Camera

The **Add Photo** button opens the iPhone's native camera directly (not a
generic file picker) - snap a photo and it's attached immediately, resized
automatically on the phone before it's stored, to keep things fast over
weak signal.

---

## 4. Using the App

### Capture (andre only)

- **Title** - short, e.g. "Irrigation pump quirk".
- **Block / Location** (optional) - free text, e.g. "Block 4 North" or "near
  the pump station".
- **Notes** - the dictated (or typed) body of the entry.
- **Tags** - type a word and press Enter to add it as a tag; existing tags
  are suggested as you type. Fully free-form - Andre can invent new tags any
  time, there's no fixed list to pick from (a starter set is preloaded so
  he isn't starting from nothing).
- **Photos** - tap **Add Photo** to attach one or more.

Tap **Save to Notebook** - the entry is saved to the phone instantly and
starts syncing to the server in the background (see
[chapter 5](#5-how-offline-capture-works)).

### Dashboard

A quick at-a-glance view: total entries, entries this week, how many have
photos, how many tags are in use, a breakdown of entry counts per tag, and
the most recent entries.

### Entries

Search by title, notes text, or block/location, and/or filter by a single
tag. Tap any entry to open its full detail - photos, tags, block, and full
notes text.

### Editing and archiving (andre only)

From an entry's detail view: **Edit** reopens it in the Capture form with
everything filled in; **Archive** soft-deletes it (it stops appearing in
lists, but nothing is actually erased from the database - there is
currently no in-app "restore an archived entry" option, so archive is meant
for genuine mistakes, not routine cleanup).

---

## 5. How Offline Capture Works

Every **Save to Notebook** writes the entry (and any attached photos)
straight into the phone's own local storage first - this always succeeds
instantly, with or without a signal. A background sync process then:

1. Checks the phone actually has a connection.
2. Sends any not-yet-synced entries to the server.
3. Only once an entry is confirmed saved on the server, sends its photos
   (this order matters - the server needs to know about the entry before it
   can accept a photo for it).
4. Retries automatically every ~10 seconds, and immediately whenever the
   phone regains a connection - nothing needs to be triggered manually.

### Location and weather on a note

Opening the **Capture** tab starts the phone looking for a GPS fix, and the
line above the Save button says whether one is ready. Saving never waits for
it - if no fix has arrived, the note simply saves without one.

The two behave differently out of signal, and deliberately so:

- **Location** still works. GPS is the phone's own receiver and needs no
  connection, so a note taken in the furthest block still records where it
  was taken.
- **Weather** does not. It is looked up through the farm server at the moment
  of capture, so with no connection the note keeps its location and leaves the
  weather blank. It is **not** filled in later when the note syncs: that would
  record the weather hours after the fact - on a note about sunburn or frost,
  actively misleading. A blank weather reading means "we don't know", and
  that is the honest answer.

Tapping the coordinates on a saved note opens them in the phone's map app,
which is the practical point of recording them - being able to walk back to
that exact tree next season.

### The "not yet synced" badge

If anything is still waiting to sync, a small badge appears near the top of
the screen (e.g. "2 not yet synced"). This is the only signal that
something hasn't reached the server yet - it's normal to see it briefly
after saving an entry with no signal, and it should clear on its own once
back in range. If it persists for a long time despite having a good
connection, check [Troubleshooting](#7-troubleshooting--faq).

### A real risk to know about: iOS storage eviction

If the installed app goes completely unused for roughly a week or more, iOS
can silently clear its local storage to free up space - including anything
still waiting to sync. This is exactly why the sync happens automatically
and quickly (every ~10 seconds whenever online) rather than waiting for
Andre to manually "upload" - the safest habit is simply opening the app
again with a signal reasonably soon after a batch of offline captures,
rather than leaving unsynced entries sitting for days.

---

## 6. Backups & Restore

A full backup (database + all photos) is taken **automatically every day at
02:00**, keeping the **14 most recent** backups on the server - same
mechanism as the harvest app. This only runs if the server is actually
running at 02:00; if the PC is off overnight, that night's backup is simply
skipped.

Andre (not `son` - the backup endpoints are recorder-only) can also trigger
one on demand from the **Settings** tab: the **Backups** card has a
**Backup Now** button, plus a list of existing backups with a **Download**
link for each - useful for pulling a copy off the server onto a phone or
laptop without needing to touch the server itself. On the server, the
underlying files sit in `data\backups\`, named like
`backup_20260807_020000.zip`.

**Recommended:** every so often, copy the latest `data\backups\*.zip` file
off the server entirely (a cloud drive, USB stick, anywhere off that one
machine) - the 14-backup retention only protects against recent mistakes,
not against that PC's disk failing outright.

### Restoring

There's no restore button - it's a manual file swap, and it fully replaces
current data (anything captured after the backup's timestamp is lost):

1. First, copy the *current* `data\notebook.db` and `data\photos\` folder
   somewhere safe, in case the restore turns out to be the wrong call.
2. Stop the server: `schtasks /end /tn "Bekfontein Farm Notebook Server"`.
3. Unzip the backup - it contains `notebook.db` and a `photos\` folder.
4. Copy those into `data\`, replacing the current files.
5. Start the server again:
   `schtasks /run /tn "Bekfontein Farm Notebook Server"`.

---

## 7. Troubleshooting / FAQ

**"Not yet synced" badge won't clear, even with good signal.**
Force-close the app (swipe it away in the iOS app switcher) and reopen it
from the Home Screen icon - this restarts the sync loop cleanly. If it
still won't clear, confirm the phone can actually reach the server's
address in Safari (try loading it directly); a changed server IP or an
expired Tailscale connection are the most likely causes.

**A camera photo won't attach / the Add Photo button does nothing.**
Confirm the app was opened from its installed Home Screen icon over the
HTTPS/Tailscale address, not a plain `http://` LAN address opened directly
in Safari - camera access in an installed PWA needs the secure-context HTTPS
setup described in [chapter 2](#tailscale-https-required-for-the-installable-offline-app).

**Notes aren't recording a location.** The line above the Save button says
what the app has: "Finding your location..." means it's still looking, and
"No location available" means iOS refused or there's no fix. Check, in order:

1. The app was opened from its Home Screen icon on the HTTPS address
   (`https://<server-name>.<tailnet-name>.ts.net:8443/app/`). On a plain
   `http://` LAN address iOS blocks location outright and the app can only
   report that none arrived - the commonest cause, and it looks like a broken
   feature rather than a wrong address.
2. Settings → Privacy & Security → Location Services is on, and the app (or
   Safari) is allowed "While Using".
3. He's outdoors and has waited a few seconds - a first fix under a shed roof
   can take a while, or never arrive.

A note always saves regardless; it just saves without coordinates.

**Notes have a location but no weather.** Expected when the note was captured
out of signal. The weather is read at the moment of capture and deliberately
not backfilled later, because that would record conditions hours after the
fact. Blank means "not known".

**Dictation isn't picking up Afrikaans / keeps typing in the wrong
language.** On the iPhone: Settings → General → Keyboard → Keyboards →
confirm both the desired language keyboards are added; iOS dictation
follows whichever keyboard is currently active, switchable with the globe
key while typing.

**Son can see the app but has no Save/Edit/Archive buttons.**
That's expected - his account is *viewer*-only by design (see
[chapter 1](#the-two-accounts)). If he genuinely needs to record entries
too, log him in as `andre` instead, or ask about adding a third account.

**An entry looks like it disappeared after installing the Home Screen
icon.** This is the iOS storage-silo issue described in
[chapter 3](#install-to-home-screen-before-first-use---this-matters) - it
was captured in a Safari tab before installing, and is sitting in Safari's
own storage, invisible to the installed app. There's no way to move it
across after the fact; re-enter it from the installed app going forward.

---

## Annexe A: Data Field Reference

### Entry
- `id` - a random ID generated on the phone at creation time (this is what
  makes offline sync safe to retry - resending the same entry twice never
  creates a duplicate).
- `title`, `body` (the notes text), `block` (free text).
- `tags` - any number of free-form tags.
- `photos` - any number of attached photos.
- `created_by` / `created_at`, `updated_by` / `updated_at`.
- `archived` - true once soft-deleted; archived entries are hidden from
  search/lists but not erased.
- `latitude`, `longitude`, `location_accuracy_m` - where the phone was when
  the note was captured, from its own GPS. Blank if the fix wasn't ready yet
  or location permission was refused.
- `weather_temp`, `weather_humidity`, `weather_condition` - the conditions at
  that spot at that moment. Blank when the note was captured out of signal.
  Blank always means "not known", never "nothing to report".

Both sets are recorded **once, when the note is first created**, and a later
edit never changes them: they describe a moment that has already happened, so
fixing a typo that evening must not restamp the note with the kitchen's
coordinates and tonight's weather.

### Tag
Just a `name` - created automatically the first time anyone uses it on an
entry, shared across all entries.

### Photo
`filename` (on the server, under `data\photos\`), `caption` (currently
always blank - no UI to set one yet), the entry it belongs to, and when it
was uploaded.
