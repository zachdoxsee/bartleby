// Settings for this copy of bartleby.
window.BARTLEBY = {
  // Address of your own cobalt instance (github.com/imputnet/cobalt), which fetches the audio for links to
  // Instagram, TikTok, YouTube and so on. Leave empty and links to those sites can't be fetched; dropped
  // files and direct links to audio or video files still work.
  // The public api.cobalt.tools is not for use by other projects, so this must be an instance you run.
  // Do not put an API key here: this file is sent to every visitor. If your instance needs a key, the
  // request has to go through a small server of your own that adds it.
  // While developing on this machine it points at the local test instance (docker container "bartleby-cobalt").
  cobalt: location.hostname === "localhost" ? "http://localhost:9000/" : "",

  // Optional: pin how the speech-to-text model runs for every visitor, overriding the settings panel's default.
  // Leave unset for "standard". See ENGINES in app.js for the three setups and engine/worker.js for measurements.
  // setup: { model: "onnx-community/whisper-small", device: "wasm", dtype: "q8" },
};
