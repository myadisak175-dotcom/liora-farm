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
- Windmill: a Sketchfab model supplied for this project, restyled into flat colour patches (`assets/models/windmill.glb`); author and licence credit still to be filled in.

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

It falls on the grass too: `shadow.receive(level.grass.material)` teaches the grass shader to ask the same question for every blade at the blade's own height, so her outline lies across the tops of the grass with the same cool tint as the trees' shadows (the old soft patch over the grass is gone). Rocks and other objects do not receive it yet. Inside a tree's shadow it fades out, and at night the round blob under her feet takes over.

Wading leaves a foam wake in the same style as the foot of the waterfall (`WATER_WAKE` in `stylized-water.js`): a sheet of white foam with holes of mixed sizes, thick round the legs, tearing into threads and flecks behind her and dissolving in place. It is one smooth field laid down along her path (`WATER_WAKE.track` once a frame from the level's `follow`), so nothing pops in or out; each footstep adds a puff where the foot lands. The big foam rings (`WATER_RINGS`) are now only for splashes. The churn under the waterfall is drawn on the water surface itself (`WATER_CHURN`): cells of two sizes laid out in metres, carried outwards by the flow (fast near the fall, slower further out), with patches of thicker and thinner foam drifting through it, so it never looks like one pattern turning round. Along the foot of the falls soft white billows boil up like small clouds (`createBillows` in `stylized-waterfall.js`): camera-facing cards with a cloud of round lobes drawn on each, white in the light and pale blue in the folds, small puffs that pop up out of the foam, drift out over the pool spreading apart and growing like clouds, and fade away with their outlines going soft. Their size, number, spread, rise, life and fade are sliders under **ฟองตีนน้ำตก** in **ปรับน้ำ** (`FALL_TUNE`). Where the sheet lands it also heaves the pool: small restless pokes all along the foot, and every so often a heave: the water wells up at three spots along the foot, with a shallow trough round each holding the same amount of water, and rolls out across the pool as waves through the wave simulation (sliders under **คลื่นจากน้ำตก**). Crowns and cones of water are kept for splashes in the river.

## The cliff path, the meadow and the windmill

A path is cut into the east cliff's shoulder (`createValley({ climb: { side: 1 } })` in `stylized-terrain.js`): it starts on the valley floor a little up-river of the bridge, climbs at a steady grade along the cliff face and comes out on the plateau beside the falls. Its line is found on the land itself (where the face reaches the height the path has climbed to), and the ground is set to the path's height along it. On top is a small open meadow with a windmill looking down the valley; its sails turn. `level.confine` keeps a walker on the valley floor, the path or the meadow. `?view=climb` starts at the foot of the path, `?view=mill` on the meadow.

`stylized-props.js` loads buildings and props that have been restyled into flat colour patches (vertex colours, no textures) and lights them with the kit's three hard bands. The windmill went from 4.9 MB with three textures to under 0.5 MB.

## The village above the falls

The plateau behind the falls is built up in terraces (`createValley({ tiers })` in `stylized-terrain.js`): the land and the upper river step up twice, and the river comes down each riser as a small cascade (`createWaterfall({ scale })`). Ramps cut into the risers lead from one terrace to the next. On the lower terrace: the windmill's meadow, a stone bridge over the river, two houses and a well, and a water mill whose wheel turns in the stream below the first cascade. On the upper terrace: a great tree, three houses, a fenced pasture, a plank bridge, and a keep on a knoll.

All the buildings are stand-ins built in code (`stylized-buildings.js`: boxes, slabs and cylinders in flat colours, drawn with the props' material) until real models take their place; where everything stands is the `VILLAGE` table at the top of `valley-level.js`. Up there a walker may stand on even ground, on the ramps and on the bridges; the risers, the river and the buildings are walls. `?view=village`, `?view=tree` and `?view=keep` start in the village.

Round the village the land stands up as hills (`tiers.rise`, `villageHills` in `valley-level.js`): a craggy ridge behind the upper terrace, out of which the river comes through a gorge, and shoulders climbing away on either side. Rocky tors stand up out of the terraces (`VILLAGE.tors`), one of them joining the keep's knoll into a ridge. Crags and boulders lie along the foot of each riser, beside the cascades and round the knoll (baked into one mesh for each kind of stone). The small things that make it look lived in (market stalls, barrels, crates, hay, benches, lamps, signposts, a cart, woodpiles, sheep in the pasture) are `propGeometry` in `stylized-buildings.js`, placed by the `VILLAGE.props` table; bushes, flower beds and pines are placed by hand in the same table.

## The village's ways

The trodden ways between the houses (`VILLAGE.paths`, the ramps and the yards) are drawn by the ground itself. `valley-level.js` bakes a small picture of how far every spot is from the nearest way and how paved it is; the terrain shader (`WAYS` in `stylized-terrain.js`) reads it and lays down, from the grass inwards: a verge of short yellowed grass, a rim of darker damp earth, the trodden earth, and pale worn patches down the middle. The edge wanders and is ragged. Pebbles lie thick along the edges and thin in the middle. Yards marked as paved in `VILLAGE.yards` (round the well, before the keep's door) are laid with cobbles that thin out into single stones at the yard's edge. The grass map agrees with it: no blades on the earth, sparse yellowed ones at its edge, and on the verge they stand about half as tall. Long ways are worn broad, spurs to a door narrow.

## The scene editor

`🛠 แก้ฉาก` opens an editor made for a phone (`scene-editor.js`). It has two views:

- **🚶 เดินแก้ (walk)**: the game as it is played. Walk to the spot and fix it there.
  - **🖌 ระบาย**: a brush for the ground: ดิน (trodden earth), หินปู (cobbles), หญ้า (grass: takes a way away), in three sizes. Tap the ground to lay a dab, or turn on **👣 ตามเท้า** and walk the way you want: the brush follows her feet. The ground changes at once and the grass there lies down. `↶ ย้อน` takes back the last stroke.
  - **＋ วาง**: pick a tree, bush, rock or flower bed and tap where it should go. **🗑 ลบ**: tap the dot on a thing to take it out (again to put it back). **✋ ย้าย**: tap a thing, then tap where it should stand.
- **🗺 มุมบน (top)** (`?edit`): straight down, north up. Drag to move, pinch to zoom. The same brush (drag a finger; two fingers move the view), every plant and rock as a dot to pick, drag or delete, and **เส้นทาง**: the village's ways as lines whose points can be dragged, added (tap a line) and removed, new ways drawn point by point, broad or narrow; yards added, moved, sized, paved.

The ground (ways, yards, brush work) can be edited inside the village (the dashed frame in the top view) and shows as it is edited. Plants and rocks are built with the level: until the edits are saved, a mark shows what will happen (a red cross = taken out, a dashed line = moved, a plus = new).

**💾 บันทึก** keeps the edits in the browser (`localStorage`, key `liora.valley.edits.v1`) and loads the scene again with them, back in the editor at the same spot. `⋯` shows the edits as text: copy it to make them permanent (it goes into `valley-edits.js`), paste one back, or clear everything. `?edits=off` loads the valley without any edits.

The edits are a small list laid over what `valley-level.js` generates, and never change what it generates: a plant taken out still takes its turn in the dice and still keeps its neighbours at their distance, so everything else stays exactly where it was. A thing is known by its kind and where it was first put; if the level later stops generating it, its edit is simply ignored. Brush work is a list of dabs `[x, z, radius, what]` stamped over the picture of the ways, in order.
