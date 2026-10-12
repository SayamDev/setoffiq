# Optional natural speech

Kokoro.js and the Kokoro-82M model weights are licensed under Apache-2.0.
Copyright hexgrad / Kokoro contributors.

- https://github.com/hexgrad/kokoro
- https://huggingface.co/hexgrad/Kokoro-82M
- ONNX conversion: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- Licence copy: [public/licenses/kokoro-LICENSE](public/licenses/kokoro-LICENSE)

Transformers.js, copyright Hugging Face contributors, is Apache-2.0.
ONNX Runtime, copyright Microsoft contributors, is MIT.
Phonemizer, copyright Xenova contributors, is Apache-2.0; its eSpeak NG component
is GPL-3.0 (see the upstream notices linked below). This optional dependency does
not change the licence on SetoffIQ's original MIT code.

- https://github.com/huggingface/transformers.js
- https://github.com/microsoft/onnxruntime
- https://github.com/xenova/phonemizer.js
- https://github.com/espeak-ng/espeak-ng

The runtime packages retain their upstream licences in the npm distribution.
No voice cloned from a user or identifiable requested person is included.

## eSpeak NG in the optional worker

Phonemizer 1.2.1 embeds eSpeak NG pronunciation code/data, GPL-3.0-or-later.
The combined optional speech worker bundle is distributed under GPL-3.0-or-later;
SetoffIQ's original application source remains MIT. It is a separate worker,
communicating with the page through messages. No eSpeak/Kokoro code is loaded into
the main app bundle. This is an explicit exception to the older COSTS statement
that every dependency is MIT/ISC/Apache.

The deployed site includes the GPL text and source archives, accessible alongside
its executable worker through [public/licenses/VOICE-NOTICES.txt](public/licenses/VOICE-NOTICES.txt).
The eSpeak archive includes its `emscripten/` build sources. Its 328 language/voice
files were checked byte-for-byte against those embedded in phonemizer's upstream
worker and match. The npm package itself does not identify an eSpeak revision;
that comparison establishes the data provenance, rather than claiming a known
upstream build tag. The phonemizer archive contains the distributed engine's
unminified JavaScript and its wrapper/build configuration. Neither upstream engine
nor wrapper was modified. The application worker integration is in
`src/services/voice/kokoro.worker.ts`; lockfile and Vite config reproduce bundling.

## Interface animation

Lottie Web 5.13.0 is distributed under the MIT licence. The lazy light player
contains no expression evaluator. Licence text is shipped at
[public/licenses/lottie-web-LICENSE.txt](public/licenses/lottie-web-LICENSE.txt).
The small voice-guide scene is original SetoffIQ artwork under this repository's MIT licence.
