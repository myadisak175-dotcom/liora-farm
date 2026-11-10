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
