# bartleby: plan

A free, open-source, ad-free tool that turns short videos (Instagram Reels, TikTok, YouTube Shorts) into text. Positioned like cobalt.tools: feels like a GitHub project, trusted by anyone at a glance.

## Decided

- **Name:** bartleby. `bartleby.tools` was unregistered when checked. No trademark check done; Bartleby.com is an existing homework-help company.
- **Mascot:** Bartleby the scrivener (Melville, 1853) as a 20x18 pixel sprite in a pine green hoodie (drawstrings, pocket), fists at his sides. In the terminal he is a three-line plain-text face: `( ._. )` under a bowler. Brown felt bowler hat with a black band, tipped down over his left eye for a sketchy look, dark brown hair at the temple, dot eyes, flat black mouth (hidden during the sigh and error). States: idle, sigh, listening, typing, done, error. Lives in `brand/mascot.js`.
- **Idle line:** usually "i suppose you have a link."; now and then (about one time in five each) "a link. if you must." or "a link. if you insist." These replaced "psst. got a link?" on 15 November 2026 as more in his reluctant voice.
- **Personality:** a bit shifty, sighs before helping, uninterested prodigy while working, but on your side. "I would prefer not to." is reserved for ads, signup and tracking.
- **Look:** lo-fi and monospace (DM Mono), lowercase, black on white, pine `#1f5c45` as the accent, Pacific Northwest secondary colours (cedar, rain slate, moss, mist), plus basalt `#2a2d2e`, a dark grey for the terminal pane and other dark backgrounds. Pressed-edge buttons from propresets. Faint ASCII rain.
- **Loading:** he sighs, then quotes fill the wait, then the transcript arrives. A thin progress line and one status line stay visible so it never looks frozen.
- **Quotes:** 82 curated quotes in `brand/quotes.json` (taste: one-line reversals, clear thinking, attention, jabs at power, stoics, text art and street art).
- **Cost model:** transcription runs in the visitor's browser; a self-hosted cobalt instance fetches the media. No ads, donations only.

## Decided later

- **No terminal pane in the web page.** It was tried in the prototype and cut for clutter, especially on phones. The installable `bartleby <link>` command is still planned as its own thing.
- **Quotes appear as speech bubbles from Bartleby** while a transcript loads. Printing them in a terminal went away with the terminal pane.
- **Easiest possible start:** one button that pastes the link from the clipboard and begins. Typing or pasting into the box and pressing go also works.

## Scope

- **MVP: the free tool only.** Paste a link, get a transcript, edit it as Markdown, download the `.md`. No accounts, no payments.
- **Later, when it is relevant: a paid plan.** The free transcripts are what bring people in; the paid part is what they stay for: turning a video into useful Markdown, pulling out the information in it, and rewriting its substance as a reusable prompt (for example, a reel that taught something becomes a prompt you can run again). That step needs a language model, so it has a real cost per use, which is why it is the paid part. Nothing for it is built or mocked in the prototype.
- **Downloads (for example YouTube to MP3) as an attraction:** not decided. They carry the legal risk discussed at the start (labels sue these sites and ad networks avoid them); transcripts do not.

## To build

1. **Page layout:** an editor-style workspace in its own design, not a copy of VS Code or Claude Code. A working prototype exists in `prototype/` (run the `prototype` preview and open `/prototype/`, or see "Live copy" below); transcripts and progress are real. It includes one adopted library, Torph, for the morphing state label.
   - Icon rail on the left in the pro workspace (settings, about, supported sites, terminal version, source, donate). Hovering an icon shows only its name, like a dock; clicking opens the full panel.
   - Bartleby pane: ready immediately, asks for a link, shows one quiet progress line while he works. The only thing a visitor must interact with.
   - Editor pane with tabs; each transcript arrives as its own page named after the video, in a real Markdown editor (line numbers, preview, copy) with download as `.md`, `.txt`, `.srt` or `.vtt`.
   - "+" adds blank tabs to write in like a plain text editor; tabs can be renamed and closed, and are kept in the browser's storage.
   - Pro mode has a formatting bar (headings, bold, italic, lists, checklist, quote, link, divider) and an insert menu (table, callout, collapsible, plain-text diagrams, date, a quote) so nobody needs to know Markdown. The diagrams are our own for now; the ASCII figure components from mdxcn.dev are React-only and can come in with the real build.
   - Simple mode on phones has a footer with the link icons in one row; its panels are soft bottom sheets with a big close button, different from the pro panels. The "Built by Zach Doxsee" credit (zachdoxsee.com) is in the about panel only, not in the footer.
   - Overlays and modals inset from every edge with a sturdy propresets-style radius.
   - Simple and pro are described under "Simple and pro (decided)" below; they apply at every screen size.
   - Easter eggs typed into his prompt (for example `sudo`, `whoami`, his own line).
2. **Engine:** built, in `prototype/engine/` (framework-free, so it moves into the final site unchanged).
   - Working and tested: dropped or picked files and direct links to audio or video files are decoded and transcribed on the device with Whisper (base, 8-bit, 73 MB download, cached after the first use), with real timestamps and `.srt` export. On an Apple-silicon Mac a 13.5 second clip takes about 3 seconds once the model is cached. Phones are untested.
   - A settings panel chooses the engine, and the choice is remembered. Measured on one laptop with three short clips (`prototype/test/score.js` repeats the test):
     - "standard": small model on the processor, 73 MB, 3.2 s for a 13 s clip, about 12% of words wrong. This stays the default (decided); after a visitor's first transcript on it, Bartleby mentions once that "accurate" exists.
     - "accurate": larger model on the processor, 240 MB, 9.8 s, about 4% wrong.
     - "ultra": larger model on the graphics card, 393 MB, 2.2 s, about 2% wrong. The first switch to it opens a short dialog (one sentence and three lines: download size, who it suits, who should skip it) that must fit without scrolling.
   - Transcript layout: the video's title as the heading and the creator under it when the platform has them (YouTube does, read from tags cobalt writes into the audio; Instagram and TikTok posts have no title), then the timestamped words, then a details list (source, creator, platform, length, language, date) and a last line "transcribed with bartleby". It is all ordinary text and can be deleted. The download is named after the title. Captions, descriptions, dates and view counts are not fetched: cobalt does not return them, YouTube's needs an API key on a server, and Instagram's needs a Meta developer account.
   - Long recordings: a 10 minute 24 second recording was transcribed on the standard engine in 3 minutes 14 seconds on an Apple-silicon Mac (about 3.2 times faster than real time), giving 159 timed segments and 1,844 words, with timestamps correct to the end. By that rate 30 minutes would take about 9 minutes and an hour about 19, but nothing longer than 10 minutes has been run. Open points: an hour of audio holds roughly 230 MB in memory, which phones may not manage; and long YouTube videos are the ones YouTube most often refuses to the fetcher, so long videos are most dependable as files.
   - Long recordings get their own flow. Audio over three minutes goes through the engine in sections of about two minutes (cut at a quiet moment), which gives real progress. At five minutes or more a popup first states the length and the estimated time, using this device's measured speed when it has one. Then a plain waiting screen shows a large percentage, the time left, and "you can leave this tab"; the tab title counts up, a notification can be requested, and the screen is kept awake where the browser allows. "Stop" on a long job restarts the engine so it really stops. Measured caveat: when the tab is not in front, the browser lowers its priority and the same ten-minute job ran about three times slower on an Apple-silicon Mac; the popup and waiting screen say so, and the estimate assumes the tab stays in front.
   - Stuck repeats: the speech model sometimes gets stuck and repeats itself instead of following the audio. On the ten-minute test file (one 13.5 second clip repeated 46 times, about 1,840 words spoken) the sectioned run came out at 2,163 words: one 375-word segment of repeats, and a sentence nobody said nine times at the end. The engine now checks every stretch for three signs (more than 6 words a second, one phrase three times running, three segments running with the same words) and runs a stuck stretch again on its own, keeping the second go only if it is less stuck. Re-run after the fix: 1,799 words, no repeats, 3 minutes 13 seconds (22 seconds slower). Still open: the repaired stretch at the very end lost about two sentences (roughly 40 words), and this test file is unusually prone to the problem because it is the same clip over and over; it has not been tried on a real long recording, or on the accurate and ultra engines.
   - Language: the spoken language is chosen in settings (20 languages, English by default) because the engine cannot detect it yet. A "translate" button in the editor writes an English version in a new tab, on the device, using Whisper's own translate task. Automatic detection, and translating English into other languages (which needs a separate translation model or a paid service), are not built.
   - Links from YouTube, TikTok, Instagram and others go through cobalt. A local test instance runs in Docker (container `bartleby-cobalt`, port 9000, this machine only) and `config.js` points at it when the page is served from localhost.
   - Link test, 15 November 2026, through the local cobalt (version 11.7.1, image built 24 October 2026) on a home connection:
     - Instagram: 1 of 1 reel worked end to end (a 61 second reel, 161 words, 18 seconds on standard).
     - YouTube: 3 of 4 worked (one regular video, two Shorts). One Short returned an empty download twice; the page now reports that as a failed fetch.
     - TikTok: 0 of 4 worked. Cause found: TikTok redirects logged-out requests for a video page to a mandatory login page. A normal logged-out browser on the same connection gets the same login page, so it is a login requirement and not a cobalt fault. cobalt has no TikTok login support and its TikTok code was last changed in July 2025. We will not build a way around a login wall. For now TikTok works by saving the video in the app and dropping the file; the tool says so when a TikTok link fails. Whether TikTok shows the same wall to a server in another region is unknown and worth one test once an instance is hosted.
     - Wider YouTube check the same day: 3 of 7 videos returned audio. The other 4 (two talks, a Short, a music video link) opened a tunnel that closed in under a second with nothing in it, with either audio setting and with cobalt's HLS option. YouTube is refusing the stream to cobalt for those videos. cobalt's documentation describes an optional companion service that generates YouTube session tokens for this; it has not been set up, and it exists to get past YouTube's automated-client checks, so whether to run it is the owner's decision. The page now says "the site wouldn't hand that one over" for this case.
     - Posts with several items now use their audio or first video; picture-only posts get "that post is pictures".
     - In the Claude desktop browser pane the paste button cannot read the clipboard (the pane blocks it); pasting into the box works.
     - A home connection is the easy case. Instagram in particular is known to block server addresses, so these results do not predict how a hosted instance will do.
   - Still to do: host a cobalt instance on a small server for the public site and repeat this test from it, automatic language detection, and tests on phones and long videos.
3. **Landing pages:** one search-optimised page per platform and use (Instagram reel to text, TikTok transcript, YouTube Shorts transcript, and so on), all sharing the one engine.
4. **Terminal version:** an installable `bartleby <link>` command, free and open source.
5. **Launch:** GitHub repo with README, Twitter, tool directories.

## More free tools (later)

- **Several tools is a main feature (decided 15 November 2026).** A full-width tool switcher sits just above the dock on the start screen: transcribe (working), compress and convert. Compress and convert are placeholders: choosing one shows the start screen with a "coming soon" note where the buttons were, and dropped files are refused with a line from him. Nothing is faked.
- **Local file compression:** shrink a file in the browser with nothing uploaded, in the same spirit as the transcripts. Which file types (video, audio, images) is not decided yet.
- **File conversion:** change a file's format on the device (for example .mov to .mp4, .wav to .mp3). Which formats is not decided yet.

## Simple and pro (decided)

- Everyone starts on the same screen: Bartleby, his line, one big "paste link" button with a square file button beside it, and a box to type a link.
- Two independent switches sit in the top bar on every screen size. The moon turns dark mode on or off. "pro" swaps the plain result for the full editor once a transcript exists. (Briefly pro and dark were one switch; they were separated again.)
- On the start screen pro changes only two quiet things: a small "pro" tag by the name and a faint ASCII drizzle behind Bartleby.
- Loading: while he works, the start screen shows his animated sprite, the quote bubble floating above him, a chunky segmented progress bar with the real stage under it (in the typing box's place), and the big button as "stop". The skeleton of the transcript was dropped from the start screen.
- Nothing on the start screen moves while he works or when an error appears: every element has a fixed place.
- Dark mode is the default (15 November 2026); the moon switches to light, and a visitor's choice is remembered.

### Screens and routes

- **Start** (both modes): the hero and the buttons above. While a run is in progress the big button becomes "stop". If pages already exist, a "transcripts" button appears beside the tool switcher, above the dock.
- **Simple result:** Bartleby as a small strip on top (sprite and his latest line; the stage and a thin progress bar only while he works), the transcript shown formatted rather than as raw Markdown, and the dock. "edit text" in the more sheet switches to the raw Markdown and back.
- **Pro result on a wide screen:** the workspace: icon rail, tabbed editor with formatting bar, Bartleby's pane with the paste, file and type controls.
- **Pro result on a phone:** decluttered: top bar, Bartleby's strip, the formatting bar, the page, and the dock. No rail, no tab strip, no tool row.
- "new" (the plus in the dock) returns to Start without losing pages; each new transcript becomes its own page.

### The dock

Chunky pressed-edge buttons along the bottom, single or joined in groups, with Pixelarticons icons (MIT, stored locally in `prototype/icons.js`).

- Start: settings; about and supported sites; terminal version and source; donate.
- Simple result: back (labelled, returns to Start; replaced the "+"); copy (wide, primary); save `.md` and share; more.
- Pro result on a phone: new; copy and save `.md`; preview and pages; more.
- "more" is a sheet: translate to English, save subtitles, share, then settings and the link panels.
- "pages" is a sheet: every page, tap to open, a bin to close, and "new blank page".
- Sheets on Start and Simple are soft bottom sheets with a big close button; in the pro editor they are the sturdy dark-edged panels.

## Errors are explained (decided)

Where the fix is on our side the card also says we are working on it (TikTok links, refused YouTube streams, the engine, file types, language detection, limits, more sites). Failures that come from the post itself or the visitor's browser (private, deleted, pictures only, clipboard blocked, not a link) do not carry that line, because it would not be true.

When something fails, Bartleby says one line and a card gives three things: what happened, the likely reason, and what to do next (with buttons such as "choose a file"), plus the raw technical detail in small print. There is a card for: no fetcher set up, TikTok's login wall, a site refusing the stream, a picture-only post, a file with no readable audio, no speech found, the engine failing, the clipboard being blocked, input that isn't a link, and the fetcher's own reasons (private, age-restricted, region, live, too long, rate limit, sign-in needed, unsupported link, unavailable).

## Small decisions from the UI pass

- Settings has four tabs along its bottom edge (engine, language, look, device) so no tab scrolls; each engine has an icon.
- The supported list shows a logo per site (Simple Icons, CC0, stored in `prototype/brands.js`), ordered from most to least widely known. "works" and "not tried yet" notes show only on localhost.
- The moon is green in light mode and a filled white moon in dark mode.
- Dropdowns use our own pixel chevron; buttons that open menus carry the same caret.
- Error cards can be dismissed with their close button and go away on their own after 15 seconds (6 seconds after the pointer leaves them); dismissing puts Bartleby's line and pose back exactly as they were before the error.
- The top bar shows the time in UTC, to the second, on wide screens only (hidden on phones as clutter).
- Error cards are compact: a title, the buttons, and the explanation, "we're working on it" line and technical detail folded under "why?". In the pro workspace on a wide screen the card sits in his pane with "why?" already open; everywhere else it is a small sheet over the dock (about 116px tall on a phone), so nothing moves.
- Phones: every text box is 16px on touch screens and narrow windows, because phone browsers (Safari above all) zoom the page into smaller ones when tapped. Double-tap zoom is off; pinch zoom still works.
- The terminal panel's install command and the source panel's `git clone` command each have a copy button. The source panel also opens "set up with an agent": a prompt to hand to a coding agent (clone, read the README and plan, serve the folder, ask before starting the fetcher, test with a short file), with its own copy button. The repository address in both is a placeholder until the repository is public.

## Phase 1 (the free tool): approved scope

Built in the prototype:
- Several links at once: paste them together and each becomes its own page, one after another; "stop" cancels the rest.
- Every transcript is its own page, named after the video.
- Export formats: `.md`, `.txt` (plain words, no timestamps), `.srt`, `.vtt`.
- Timestamps link back to that moment in the video, in preview, for YouTube (the only tested site with such links).
- Share from other apps: the site has a web app manifest with a share target, and opening it with `?url=<link>` starts on that link. Needs a real install on a phone over HTTPS to confirm.
- The supported-sites panel lists whatever the cobalt instance reports.

Approved, not built yet:
- **Support everything cobalt supports.** cobalt 11.7.1 reports 21 services: bilibili, bluesky, dailymotion, facebook, instagram, loom, ok, pinterest, newgrounds, reddit, rutube, snapchat, soundcloud, streamable, tiktok, tumblr, twitch clips, twitter (X), vimeo, vk, youtube. The engine already passes any link through; each service needs one real link tested, a note on what details it returns, and a clear message when it needs a login. Only YouTube and Instagram are confirmed; TikTok is blocked by a login wall.
- **GitHub, all three:** (1) publish the open-source repository (a README draft is in `README.md`; creating the repository needs your GitHub account); (2) the terminal command writes `.md` files straight into the folder it is run in, so it works inside any repository; (3) "save to gist" and "commit to a repository" from the editor, which need a GitHub sign-in.
- **Automatic language detection.** The speech library does not offer it directly, so it needs its own piece of work; until then the language is a setting.
- **`.docx` export.**

## Phase 2 (paid)

Summaries, chapters, key points, the reel-to-prompt tool, and translation into languages other than English. Not started; nothing for it is in the prototype.

## UI and UX pass (later)

- Further layout and interaction tweaks, to be listed when that pass starts.

## Live copy

- **v1.0, the MVP**, deployed 15 November 2026 to Vercel as project `bartleby`. Address: https://bartleby.tech (bought through Vercel on 15 November 2026, renews at $49 a year; www redirects to it). https://bartleby-pi.vercel.app still works.
- A popup on a visitor's first visit says it is v1.0, the MVP: files and direct media links work; links from Instagram, YouTube, TikTok and other sites, and the compress and convert tools, are not ready yet. It can be reopened from the about panel. With no fetcher set, the supported-sites panel marks the main sites "coming soon".
- `vercel.json` serves `prototype/` at the site root and `brand/` beside it; `.vercelignore` keeps this plan, the README, the test audio and the brand sheet off the site. To publish again: `vercel deploy --prod` from this folder.
- On the live copy, files and direct links to audio or video files work. Links to Instagram, YouTube and the rest do not, because no fetcher is hosted yet; the page says so with its explained error. Checked after deploying: the page loads, the speech model downloads and runs, and a pasted Instagram link gives that error.

## Not done / to check

- Trademark check on the name.
- Hosting for the cobalt instance (the one thing between the MVP and links from video sites working). Plan for the public site: rent a small always-on server (about $5 a month), run the same cobalt container on it at its own HTTPS address, set that address as `cobalt` in `prototype/config.js`, and lock the instance to our site (allowed origin, rate limit, bot check; exact cobalt options to be confirmed against its docs). No secret key goes in the page. It cannot run on Vercel. Needs the owner to create the server account; it can sit at a subdomain of bartleby.tech. Then repeat the link tests from the server: YouTube is likely to refuse more often from a rented server than from a home connection, Instagram is untested from one, and TikTok stays blocked by its login wall.
- The local test cobalt container (`bartleby-cobalt`) is still running on this machine. Stop it with `docker stop bartleby-cobalt` when it is not needed.
- Publishing: run `vercel deploy --prod` only from this project's folder. Run from the home folder it offers to upload the whole home directory; answer no.
- Decisions still open with the owner: what to do about YouTube refusing about half of links; which file types the compression tool handles; the licence; whether "we're working on it" should also show on errors caused by the post or the browser.
- Favicon legibility at 16px with the brown hair on the pine tile.
