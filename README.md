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

**The cliffs are carved into blocks of rock** (`rocks.js`), from the foot of the falls to the valley's mouth for now. The land's own mesh is too coarse on a cliff (half a metre between points, so a face is a few stretched triangles), so each face gets a fine skin that follows the very same heights, is tucked under the land along its foot and top edge, and is painted with the land's own material. Between foot and top it stands out of the face block by block, cell by cell and layer by layer, so the ledges fall on the strata's seams. Nothing changes for walking; faces beside a path are left as they are.

## The village above the falls

The plateau behind the falls is built up in terraces (`createValley({ tiers })` in `stylized-terrain.js`): the land and the upper river step up twice, and the river comes down each riser as a small cascade (`createWaterfall({ scale })`). Ramps cut into the risers lead from one terrace to the next. On the lower terrace: the windmill's meadow, a stone bridge over the river, two houses and a well, and a water mill whose wheel turns in the stream below the first cascade. On the upper terrace: a great tree, three houses, a fenced pasture, a plank bridge, and a keep on a knoll.

All the buildings are stand-ins built in code (`stylized-buildings.js`: boxes, slabs and cylinders in flat colours, drawn with the props' material) until real models take their place; where everything stands is the `VILLAGE` table at the top of `valley-level.js`. Up there a walker may stand on even ground, on the ramps and on the bridges; the risers, the river and the buildings are walls. `?view=village`, `?view=tree` and `?view=keep` start in the village.

Round the village the land stands up as hills (`tiers.rise`, `villageHills` in `valley-level.js`): a craggy ridge behind the upper terrace, out of which the river comes through a gorge, and shoulders climbing away on either side. Rocky tors stand up out of the terraces (`VILLAGE.tors`), one of them joining the keep's knoll into a ridge. Crags and boulders lie along the foot of each riser, beside the cascades and round the knoll (baked into one mesh for each kind of stone). The small things that make it look lived in (market stalls, barrels, crates, hay, benches, lamps, signposts, a cart, woodpiles, sheep in the pasture) are `propGeometry` in `stylized-buildings.js`, placed by the `VILLAGE.props` table; bushes, flower beds and pines are placed by hand in the same table.

The village crates and barrels use the original farm GLBs restored from the pre-rebuild `assets/models/builder/crate.glb` and `wine_barrel.glb`. `legacy-wood-props.js` keeps their original meshes and UVs, uses the `*-stylized.glb` variants with new 512px hand-painted-style honey wood / matte grey metal albedo maps, normalizes their bases and heights to the existing placements, and batches each kind into one mesh. The original GLBs remain available; editable albedo maps are in `assets/textures/props/`. The prop shader applies the same light bands and haze as the village. If one model cannot load, its stand-in remains. Other village props stay procedural.

## The village's ways

The trodden ways between the houses (`VILLAGE.paths`, the ramps and the yards) are drawn by the ground itself. `valley-level.js` bakes a small picture of how far every spot is from the nearest way and how paved it is; the terrain shader (`WAYS` in `stylized-terrain.js`) reads it and lays down, from the grass inwards: a verge of short yellowed grass, a rim of darker damp earth, the trodden earth, and pale worn patches down the middle. The edge wanders and is ragged. Pebbles lie thick along the edges and thin in the middle. Yards marked as paved in `VILLAGE.yards` (round the well, before the keep's door) are laid with cobbles that thin out into single stones at the yard's edge. The grass map agrees with it: no blades on the earth, sparse yellowed ones at its edge, and on the verge they stand about half as tall. Long ways are worn broad, spurs to a door narrow.

## The abyss

Down the valley the river runs out over the brink of an abyss: a round pit 80 m across (`abyss-shape.js`: where everything is, `ABYSS`, and how it bends the land; `abyss-scene.js`: its falls and clouds). The map now runs on to z = 170 to take it in.

- The river spreads out among rock islands (small trees and bushes on them, low sandbars between) and pours over the brink in four falls. Three brooks run in across the plateau from the east, west and south and drop in from the rim.
- The brink is not a circle: round the south half it swings in and out in broad bays and points (`rimR`), and slabs of rock jut out over it. The walls step down in ledges that wander in and out and in places give out altogether into one tall face; ribs of rock run down them (`ABYSS.ribs`). Below, three sheets of mist hide the lower ledges, and further down only blue, then dark: no floor is ever seen (`uDeepOn` in the terrain shader).
- The falls go down in different ways (`pools` / `split` in `ABYSS.lips` and `ABYSS.brooks`): some land in a pool in a shelf of rock on a ledge, boil up into white spray (the valley's billows, turned to face out over the pool) and spill on, one ledge after another; the east brook splits round a rock as it leaves its pool; the rest drop sheer. Every fall's last drop frays away into the clouds.
- The clouds are soft puffs in the same style as the foot of the falls, sitting on the ledges and drifting slowly round, thicker where the falls go in, with a slow swirl of mist under them and the dark eye left open in the middle.
- A second path is cut into the east cliff (`createValley({ climbs })`): from the valley floor it climbs to the rim. A trodden way runs round the rim behind a rail, over plank bridges at the brooks, and out onto a lookout (a tongue of rock with a bench) that faces the river's falls. In the river she can wade the shallows up to the brink, but not the runs into the falls.
- A rope bridge (`ropeBridgeGeometry` in `stylized-buildings.js`, where it hangs in `ABYSS.span`) crosses the pit's north end just past the brink the river falls over, from the clifftop by the top of the path up to the far end of the rim walk, so the walk round the rim is a whole loop. It sags 3.2 m at the middle, where a wider landing is for standing and looking straight down into the clouds, and it sways a little, more while she is on it.
- `?view=abyss` starts on the lookout, `?view=brink` in the shallows at the brink, `?view=rim` at the foot of the path up.

**📍 ไปที่…** (`teleport-menu.js`) opens a list of every place the map offers, by area (the valley, the village, the abyss), and takes her straight there. The same names work as `?view=` (`start`, `falls`, `climb`, `village`, `mill`, `tree`, `keep`, `abyss`, `bridge`, `brink`, `abyssNorth`, `abyssEast`, `abyssWest`, `rim`).

The valley's own trees, rocks and flowers are still thrown with the same dice over the land as it lay before (`V.legacyKindAt`), so everything generated earlier stands where it stood and edits made in the scene editor keep their place; what would now land in the widened river or on the new path is left out. The abyss's forest and rocks have dice of their own.
## The guild

Where the keep stood, on the rock at the west end of the upper terrace, is the adventurers' guild (`stylized-guild.js`): the place only for now, no people in it yet.

- **The hall** has three storeys and is walked into through its open door with no cut. Ground floor: the reception desk, the quest board, a shop counter in the corner behind the stair, a hearth and tables. First floor: a gallery round an opening that looks down into the hall, books along one wall. Attic: the guild master's room, and a door out to a balcony over the front door.
- **Out of doors**: stone steps up from the terrace to a paved court, a duelling ring behind the hall (sand inside a kerb of stones, two gates), and a training yard south of the ring (straw dummies, archery butts, weapon racks). The back door of the hall opens onto the yard; a way round the north side leads to the ring.
- **How she walks in it**: the three floors are fixed heights joined by two straight stairs; she changes storey halfway up a stair. Walls, rails and furniture are line segments and circles marked with the storeys they stand on. `level.guild.storey` is -1 out of doors, 0 / 1 / 2 inside.
- **How it is seen**: while she is inside, the outside of the hall is thinned away and the rooms are drawn like a doll's house: inner walls are seen from their front only, the things on a wall are put away with it when the camera is behind it, and a floor or ceiling above her is drawn only while the camera is below it. So nothing ever stands between her and the camera.
- **The ground** is levelled by a `pads` entry in `createValley({ tiers })` (`stylized-terrain.js`). The plants and rocks of the valley are still thrown with the same dice on the land as it was, and whatever fell on the guild's ground is left out, so nothing else in the valley moved.
- `level.guild.spots` lists places for people and things to do later (reception, board, shop, tables, library, master's room, balcony, ring, yard). `?view=guild` starts at the foot of the steps.

## The depths of the abyss

Two layers down in the abyss, reached by **warp stones**: one on the rim beside the walk near the lookout, two in layer 1 and one in layer 2. Standing by a stone shows a 🌀 button that lists the other stones. No path joins them to the rim.

1. **The shelf and the meadow** (one map, walked end to end):
   - **The shelf** (หิ้งหญ้าริมทะเลเมฆ): a grassy shelf on the pit's wall above a sea of cloud. A tarn fed by a fall off the wall, a stream that runs off the brink, a headland to look out from, rocks standing in the clouds and hanging in the air. Its warp stone is at the north end.
   - **The ledge**: at the shelf's south end the land narrows to a ledge about 9 m wide along the brink, outside the meadow's east wall, and the path follows it down to the window in that wall.
   - **The meadow** (ทุ่งใต้เสาหินลอย): walled round, the widest. Rolling grass, paths, two ponds (one with lilies and a fall from a floating rock), flower drifts, trees. The window in its east wall is the way in from the ledge. It has a warp stone of its own at its north end. It is laid out in a frame of its own (`MEADOW`) and turned half round into the shelf's (`toM`), so its numbers still read as they did when it was a scene of its own.
2. **The gorge** (หุบน้ำตกในหมอก): a winding gorge with four side chambers, each with a tall two-step fall and a pool; a stream joins them. Rock pillars, mossy boulders, shafts of light, a lid of mist overhead.

- **Each layer is a scene of its own** (`depths-level.js`, `?map=depths&layer=1|2`, `&view=stone-shelf|stone-meadow|stone-gorge` to stand by a stone; the old `layer=3` opens layer 1 by the meadow's stone): the valley is too much for a phone to hold along with what lies under it. A warp opens the page again in the other scene (`warp-ui.js`), so everything of the scene she leaves is let go of first; coming back up is `?view=warp-rim`. The valley itself holds only the rim's warp stone.
- **Where things are and how the land lies** is `abyss-depths.js`: height maths on a 0.5 m grid, drawn with the valley's own terrain paint (`_terrain.terrainMaterial`), so the walls have the same strata as the pit's. A layer has its own ground picture, fluffy grass, clear water (ripples, wading), falls, clouds and plants, built the same way as the other maps.
- **The rock** down there is built of broken blocks (`rocks.js`): every rock face of a layer's land gets a stack of chunky flat-faced blocks stood in front of it, each its own size, lean and shade, with grass on top hanging over the lip and damp stains low down. The land behind is painted as plain deep stone (`rocks.js`), so a gap between blocks reads as a crack. `?rock=old` shows the bare walls, to compare.
- **The camera** comes in close when there is a wall of rock behind her, instead of being lifted over it (`player.js`); this holds at the valley's cliffs too.

## The scene editor

`🛠 แก้ฉาก` opens an editor made for a phone (`scene-editor.js`). It has two views:

- **🚶 เดินแก้ (walk)**: the game as it is played. Walk to the spot and fix it there.
  - **🖌 ระบาย**: a brush for the ground: ดิน (trodden earth), หินปู (cobbles), หญ้า (grass: takes a way away), in three sizes. Tap the ground to lay a dab, or turn on **👣 ตามเท้า** and walk the way you want: the brush follows her feet. The ground changes at once and the grass there lies down. `↶ ย้อน` takes back the last stroke.
  - **＋ วาง**: pick a tree, bush, rock or flower bed and tap where it should go. **🗑 ลบ**: tap the dot on a thing to take it out (again to put it back). **✋ ย้าย**: tap a thing, then tap where it should stand.
- **🗺 มุมบน (top)** (`?edit`): straight down, north up. Drag to move, pinch to zoom. The same brush (drag a finger; two fingers move the view), every plant and rock as a dot to pick, drag or delete, and **เส้นทาง**: the village's ways as lines whose points can be dragged, added (tap a line) and removed, new ways drawn point by point, broad or narrow; yards added, moved, sized, paved.

The ground (ways, yards, brush work) can be edited inside the village (the dashed frame in the top view) and shows as it is edited. Plants and rocks are built with the level: until the edits are saved, a mark shows what will happen (a red cross = taken out, a dashed line = moved, a plus = new).

**💾 บันทึก** keeps the edits in the browser (`localStorage`, key `liora.valley.edits.v1`) and loads the scene again with them, back in the editor at the same spot. `⋯` shows the edits as text: copy it to make them permanent (it goes into `valley-edits.js`), paste one back, or clear everything. `?edits=off` loads the valley without any edits.

The edits are a small list laid over what `valley-level.js` generates, and never change what it generates: a plant taken out still takes its turn in the dice and still keeps its neighbours at their distance, so everything else stays exactly where it was. A thing is known by its kind and where it was first put; if the level later stops generating it, its edit is simply ignored. Brush work is a list of dabs `[x, z, radius, what]` stamped over the picture of the ways, in order.

## Stylized prop rocks and cliffs (catalog)

`rock-catalog.html` shows a new set of rocks and cliff pieces made in the look of a hand-made stylized kit (`rocks.js`, section 5: `createPropRock({ type, seed })`). Each piece is a rough block cut by many flat planes (big faces, then small chips off the edges), with the creases softened a little; the paint goes by the faces: warm and light towards the sun, cool blue-grey away from it, a pale rim on the edges, darker in the creases and at the foot, moss on the tops. Big shapes are assembled from pieces sunk into each other, the way such kits are used.

- **Rocks:** ก้อนใหญ่, ก้อนกลาง, เสาหินตั้ง, แผ่นหินซ้อนชั้น, หินกรวด, หินปูทาง.
- **The cliff kit** (organic, modular): หน้าผาใหญ่ (`cliffFace`), หน้าผาสูง (`cliffTall`), สันผา (`buttress`), ผาบน (`cliffTop`), หินเชื่อมทางลาด (`slopeRock`), หินตีนผา (`footRock`), กลุ่มหิน (`cluster`), หินปิดรอยต่อ (`rubble`), and ผาประกอบ, an example of what they make together. Each piece is a few lumps of rock sunk into each other; a lump is cut along one grain (four families of side planes, none square to each other or to the ground, tipped tops, corners and shoulders taken off), so nothing reads as a box or a wall; where two lumps meet the join is shaded dark. A piece's shape depends only on its type and seed, so a level draws the same few shapes many times over (`createRockKit`: one instanced group for each type and seed).

⛰/🪨 switches between the two sets, ◀ ▶ go through a set, 🎲 rolls new shapes, ดูทั้งชุด shows the set in a row (`?type=wall`, `?all=1`, `?seed=4`). Nothing in the game uses them yet.

## The rock builder

`rock-builder.html` is for putting those pieces together by hand. Tap a piece in the bar at the bottom to set it down; tap a rock to pick it (a yellow box shows which), drag it to move it over the ground, and use the panel for turning, tipping forward/back and left/right, size and height (sink it into the ground or another rock, or lift it onto one); ⧉ copies it, 🎲 gives it a new shape, 🗑 takes it away. The pieces are painted by height above the ground (`createPropRock({ world: true })`), so stacked pieces share one shading. Their feet take on the ground's own colour, the way Unreal blends rocks into a landscape with a runtime virtual texture (`rocks.js`, section 7): the ground is drawn once from straight above into a picture of its colour and one of its height (`bakeGroundForRocks`), and the last half-metre or so of rock above the ground is painted over with that colour along a ragged edge, as if the grass ran up onto it. 🌱 กลืนพื้น turns it off and on, to compare.

**🔥 หลอมรวม** melts everything into one rock (`fuseRocks` in `rocks.js`, section 6): each chiselled piece is measured on a grid of points (signed distance: which side of its surface a point is on is told by the surface's own facing, so folds left by the cuts don't fool it), the pieces are joined with a soft minimum so the joins fill out into curves of rock, and a new surface is drawn through the grid. Faces away from the joins stay flat. It takes a few seconds; **✋ แยกชิ้น** goes back to the pieces to go on editing.

💾 keeps the work: three slots in this browser, and the layout as text to copy out (for the game later) or paste back in. The last layout is also kept by itself as you work.

## The rock test map (`?map=rocks`)

`rocks-level.js`: a small map for seeing the stylized rocks and the cliff kit in the world they will live in, with the game's own grass, ground, water and light, before they go into the real maps. A clearing in the middle; a cliff along the north with a waterfall; a pool under the falls that runs into a pond with stones standing in it; dirt paths to the pond, to the foot of the cliff and the pool, and up a ramp at the cliff's west end and along the top to a lookout by the falls. The rocks put together in `rock-builder.html` stand in the clearing (the builder's last layout in the same browser; `?layout=demo` leaves them out). 📍 has its places.

**The cliff is built the way a studio builds one.** The land is its bones: a step up to a plateau 7.6 m high along a wandering line, a hollow where the falls come over, a ramp where it runs out. The kit gives the face its shape: along the line, wherever the land's own face is high, a big piece (faces, tall blocks and ribs in turn; three shapes of each) stands sunk into the ground and into the face, scaled to the face's height there, only just overlapping the one before, so each reads as one rock; behind some of the joins another stands deeper in; here and there a top slab lies on the plateau's edge. Where the face runs down into the ramp: wedges, then fallen rocks. At the foot, on the joins: rubble, fallen blocks, huddles of rock. The land's own face (bare where it is steep) is painted the grey of the rocks' shaded sides, so what little shows between the pieces reads as a crack. A stream on the plateau comes over the lip between two blocks (`createWaterfall`) into the pool. About 145 rocks in under 35 shapes, some 310k triangles. The rocks' faces are flat colour: the light in a few steps, each face its own tone, bright edges, dark creases, moss; no painted pattern over them.

How a rock takes part in the world (the same for every rock): the ground under it is cut into one-metre cells. Each cell it stands on is solid (she walks round it), grows no grass, has the grass round it pressed down and its ground shaded (the dark at the foot that sets a rock on the ground), throws a shadow that follows the sun, and keeps the water's waves out (so the water swells round it). The rocks know the ground's height (their foot shading and moss go by it: `bakeGroundForRocks` draws the terrain once from above) and the water's level (`setRockWater`: a wet band at the waterline, greener under the water). Cloud shadows and the light of the hour reach them the way they reach everything else.

The thin edge of ground colour on the rocks' feet (`GROUND_BLEND`) is off: painting the foot in the ground's colour made rocks seem to float (the eye loses where rock meets ground); the shadow round the foot and the grass against it do that job.

**The brink.** The land's face along the cliff is all but upright, and the kit's big pieces stand against it with their backs in the land and their heads just under the level of the plateau's edge (each as tall as the face where it stands, by the lowest of the edge along its width). So from above the grass runs to the brink and she walks to it; the rocks' heads lie just below, in front. The grass hangs a little way down over the brink (the ground's paint is grass, not bare rock, for the first metre or so of the drop), so no bare strip shows between it and the rocks' heads. No slabs lie on the edge, and no piece stands above it.

**The tops of the rocks are grass, and she can stand on them.** The tallest lump of each big piece has its head at the plateau's level (a little under it), so the grass runs on from the plateau onto the rocks. On a map whose grass is known (`setRockLawn`, from the ground map's `lawnTexture`: the meadow's own colour with nothing painted over it), the flat tops of mossy rocks are painted as the meadow is, in its colour there and its long flat dabs, and grow blades of grass where they face straight up (`createGrassOn`, in patches; not where a top is buried, at the ground, or under water). Where she can stand is worked out from the rocks' real shapes (`sampleKitSurface`), on a grid of half a metre: a rock top she reaches from the land (or from another rock top) by a step of no more than half a metre, with no drop round it bigger than that, is ground she walks on (`level.standAt`: the player stands on it), not a wall. So she walks off the plateau onto the heads of the cliff's rocks, and onto low rocks and stepping stones, and stops short of their edges.

**LOD (level of detail).** Each shape of the kit is made three times, cut more coarsely each time: the same planes cut it, so it is the same shape with fewer points (a cliff face: 6,400 / 2,400 / 960 triangles). A rock is drawn with the version its distance calls for, counted in its own sizes (its radius times its size), so a big cliff piece keeps its detail further off than a pebble: in full within about 3 of its radii, the middle one to about 6.5, the coarsest beyond (`ROCK_LOD`, with a little slack so one at the edge does not flicker). The kit sorts its rocks again whenever the camera has moved half a metre (`kit.userData.update(camera)`, from the level's update). In the test map that draws 80k–135k triangles instead of 314k, depending on where she stands.

### Moving the rocks by hand (`rock-editor.js`)

The code lays the rocks out the way a studio's tools do; `🪨 แก้หิน` is the pass the studio's artist makes over it, in the map itself, made for a phone. The camera flies free of her: one finger turns round what it looks at, two fingers move it and zoom (the mouse wheel too). Tap a rock to pick it (a ring round it on the ground, its name above); drag it to move it (it keeps its depth in the ground as it goes, by the lowest ground under it, so a cliff piece stays on the land below the face); the sliders turn it, tip it forward or sideways, size it, raise or sink it; ◀ ▶ another shape of the same kind; ⧉ one more like it; ⬇ down onto the ground; 🗑 out. `＋ เพิ่มหิน`: a new piece of the kit, where you tap the ground. `↶ ย้อน` goes back one change.

**Fitted to the cliff's edge (📐 เสมอขอบผา).** The big pieces the cliff is dressed with are fitted to it: the foot sunk into the low ground in front, the head (the top of the piece's front, `rockFrontTop`) level with the plateau's edge, the piece stretched up or down (`sy`) to span the face. In the editor a fitted piece stays fitted whatever is done to it: made bigger it grows wide and deep and its height still spans the face; made smaller it is narrower and its head still meets the edge (it never floats). Moved along the cliff, turned, given another shape: fitted again. The 📐 button fits a piece or lets it go; a cliff piece put down at the cliff is fitted at once.

`💾 บันทึก` keeps the rocks in this browser and loads the map again, back in the editor at the same view: her way round the rocks, the grass, the shade and the shadows are worked out again for where they now stand (until then only the rocks themselves move). From then on that list is the map's rocks, all of them (`?edits=off`: the code's layout). `⋯` gives the list as text: sent to Claude and put into `rocks-layout.js`, it is the game's for everyone; pasted back, it is used again. There too: back to the game's own layout.

### Dirt paths (`ground-paths.js`)

Trodden paths of warm sandy earth, the way a studio lays a road over a landscape: a ribbon that follows a line over the ground (a spline decal) with its own painted look, a hair above the land. The ground map is told where the path is (bare earth, clumps of grass pushing in from the edges, short trodden grass beside it), and the ribbon reads that map back: where the map says grass grows, the ribbon is not drawn, so grass and path meet along one ragged edge. The paint: the old Liora Farm ground textures (`assets/ground/path-sand.webp`, `path-dirt.webp`, seamless, brought back from the repo's history): sand down the worn middle, dirt creeping in from the edges in patches and in damp spots, each laid twice at two sizes and turned so the repeat does not show, the grit made a little stronger so it reads on a phone; a dark rim of roots where the grass begins, and the sun's shadows. One picture of how far every point is from the nearest path's middle is shared by all the ribbons, so where two paths meet they agree. (Without the textures it falls back to painted dabs of tone.) The path lies a few centimetres below the grass; flat stones (`flagstone`, a new rock piece) are set into it alone or in twos and threes, pebbles lie by its sides, and a few flowers grow beside it. A level can keep things that grow off its paths with `keepClear(x, z, r)` (the forage reads it). In the rock test map: from the start down to the pond's beach, and on to the foot of the cliffs (📍 ทางดิน).
