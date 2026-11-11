# Liora Farm

Fresh start using the uploaded meadow exploration project (v19).

A static Three.js game with mobile movement, a third-person camera, meadow vegetation, animals, interactive water and sky/water tuning.

## Run

Serve this directory over HTTP. Open `index.html`. GitHub Pages serves the same entry point. Three.js 0.170.0 and its addons load from jsDelivr.

Touch: left side to move, right side to rotate the camera; tap water to make ripples.

## Asset credits

Credits retained from the supplied project:
- Vivi: VRoid sample (CC0).
- “DEER” by WildMesh 3D (CC BY-NC 4.0).
- Grass approach inspired by Cortiz (MIT).

The previous game remains available in Git history before this replacement.

## Painted foam

`assets/water/foam-brush-v1.png` is an original AI-generated grayscale brush mask created for this project. The shader samples the artwork in flowing coordinates, limits swash foam to shallow edges, and uses the wave simulation for short-lived contact foam. No Unreal or Blender package assets are included.

Foam transport uses a damped wave-pressure velocity potential stored in the simulation alpha channel. Its gradient advects painted foam density in blue with a fixed 60 Hz semi-Lagrangian step, solid boundary masking and exponential dissipation. This is a lightweight surface approximation, not a full 3D fluid solver.



## Splashes and footsteps

Splashes and wading are made by the water's own wave simulation, in the same painted style as the rest of the water: a tap or jump heaps the surface up (the simulated height lifts the water mesh) and throws painted-brush foam onto it, which the flow then carries and wears away; a footstep presses a dip that rings outward and leaves a little foam behind. There are no separate splash meshes. The sliders are in **ปรับน้ำ** (น้ำนูนขึ้นตรงจุดกระเซ็น, ฟองที่ติดค้างตามรอยเท้า / จุดกระเซ็น). `anime-cells.js` bakes the 256x256 cellular mask the surface samples for its sparse foam islands.

Use **ไปดูน้ำ** to move to a nearby clear shallow bank, then **ทดสอบน้ำกระเซ็น** or tap the water. `?view=water` starts at the bank, including on the default valley map. `?map=meadow&view=water` and `?map=hills&view=water` select the other maps.

Footsteps follow the character's foot bones: the water is touched at the moment and the place each foot comes down, harder when she runs. Every footstep, splash and the foot of the waterfall also throws out an anime foam ring (`WATER_RINGS` in `stylized-water.js`): a cell-patterned ring of white foam that spreads, opens in the middle and breaks up at the rim. Slider: **วงฟองอนิเมะตอนเหยียบน้ำ / น้ำกระเซ็น / น้ำตก**.

Anime water: the **น้ำ: อนิเมะ / น้ำ: สมจริง** button switches between flat colour bands with hard-edged foam and drawn strokes (`WATER_TUNE.anime` = 1) and the clear, mirrored water (0, the default). The choice is remembered.

A full splash (a tap, the **ทดสอบน้ำกระเซ็น** button) also throws up a crown and a jet, drawn by `water-droplets.js` together with the drops. The crown is a thin sheet of the river's own water: clear and turquoise, with the sky on its rim, and white only at the churned foot and along the thick lip. Its lip swells into rounded fingers with a bead at the tip, where the drops fly off. As the crown sinks, a column rises out of the middle; the bulb at its tip lets go as one or two fat drops. A footstep throws only two or three drops and its ring of waves, no crown.

## The walker's shadow

By day the character throws her real shadow: her own outline, moving with her animation, lying the same way as the trees' shadows and growing long when the sun is low. `character-shadow.js` draws her from the sun's point of view into a small picture each frame, and a patch of ground-hugging mesh around her feet darkens the ground wherever she is in the way of the light. It follows slopes and shows on the river bed through the water.

It falls on the ground only. Where grass covers the ground the blades hide it, so the soft patch from before still stands in there; rocks and other objects do not receive it. Inside a tree's shadow it fades out, and at night the round blob under her feet takes over.

Wading leaves a foam wake in the same style as the foot of the waterfall (`WATER_WAKE` in `stylized-water.js`): a sheet of white foam with holes of mixed sizes, thick round the legs, tearing into threads and flecks behind her and dissolving in place. It is one smooth field laid down along her path (`WATER_WAKE.track` once a frame from the level's `follow`), so nothing pops in or out; each footstep adds a puff where the foot lands. The big foam rings (`WATER_RINGS`) are now only for splashes. The churn under the waterfall is drawn on the water surface itself (`WATER_CHURN`): cells of two sizes laid out in metres, carried outwards by the flow (fast near the fall, slower further out), with patches of thicker and thinner foam drifting through it, so it never looks like one pattern turning round. Along the foot of the falls crowns and cones of water rise one after another (a second `createWaterDroplets` with `solid: 0.75`, so they read against the white foam).
