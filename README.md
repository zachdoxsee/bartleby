# bartleby

Any video to text. Paste a link or drop a file and get a transcript you can edit and save. Free, open source, no ads, no signup, no tracking.

```
     .---.
   _(_____)_
    ( ._. )

 i suppose you have a link.
```

## What it does

- Turns speech in a video or audio file into a timestamped transcript.
- The listening happens in your browser, on your device. Nothing you paste or drop is uploaded.
- Edit the result as Markdown, then save it as `.md`, `.txt`, `.srt` or `.vtt`.
- Translates speech in 20 languages into English, also on your device.

## How it works

- **Speech to text:** OpenAI's Whisper models, run in the browser with [Transformers.js](https://github.com/huggingface/transformers.js). Three settings trade download size for accuracy.
- **Fetching a link:** a self-hosted [cobalt](https://github.com/imputnet/cobalt) instance returns the audio for a video link. Files and direct media links need no server at all.
- **The page:** plain HTML, CSS and JavaScript. No framework and no build step.

## Run it yourself

1. Serve this folder with any static file server, for example `python3 -m http.server 4174`, and open `/prototype/`.
2. To fetch links from video sites, run your own cobalt instance and put its address in `prototype/config.js`. The public cobalt service is not for use by other projects.
3. To publish it, `vercel.json` serves `prototype/` at the site root; run `vercel deploy --prod` from this folder.

## Status

Version 1.0, the MVP, live at https://bartleby.tech. Files and direct media links work; links to video sites do not yet, because no fetcher is hosted. See `PLAN.md` for what is built, what is tested, and what is not.

## Credits

- Icons: [Pixelarticons](https://github.com/halfmage/pixelarticons), MIT.
- Site logos: [Simple Icons](https://github.com/simple-icons/simple-icons), CC0.
- Text animation: [Torph](https://github.com/lochie/torph), MIT.
- The name and the mascot come from Herman Melville's 1853 story "Bartleby, the Scrivener".

Built by [Zach Doxsee](https://zachdoxsee.com).

## Licence

MIT. See `LICENSE`.
