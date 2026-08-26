# Player models

Production player file path:

`liora_all_animations_web.glb`

`src/config.js` points `ASSETS.player` at this file. It is the optimized web
build used by the player runtime and exposes the seven animation clips expected
by the game. Keep the skeleton hierarchy and animation names compatible when
optimizing or replacing it.

Do not Base64-embed production models in HTML or JavaScript, and do not rename
the runtime file without updating `ASSETS.player` and the player tests in the
same change.
