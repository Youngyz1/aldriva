/**
 * Test-only orchestrator stub for the sweep route test: the model execution
 * is the boundary; the route's stamp logic under test is real.
 */
async function orchestrate() {
  return {
    runId: "run-stub-9",
    guardVerdict: "pass",
    provider: "stub",
    toolCalls: [],
    text: "stub text",
    guardedText: "stub text",
    error: null,
  };
}

module.exports = { orchestrate };
