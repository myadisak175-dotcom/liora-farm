// Deprecated compatibility shim.
// Production Home Island does not import this module.
// Pond experiments now live under src/experiments/ so unfinished visuals do
// not become part of the locked gameplay baseline by accident.
export { createPondPrototype as createPond } from "../experiments/pond-v1.js";
