/**
 * Minimal ambient declaration for three.js (Stage 19).
 *
 * three@0.186.1 ships no bundled types and @types/three would be a third
 * dependency (out of scope: exactly two pins). This keeps tsc green without
 * widening the dependency surface; @react-three/fiber keeps its own full
 * types. Revisit only if the scene outgrows primitives.
 */
declare module "three";
