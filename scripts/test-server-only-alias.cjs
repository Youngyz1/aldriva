const Module = require("node:module");
const path = require("node:path");

const serverOnlyStub = path.join(__dirname, "server-only.stub.cjs");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveServerOnlyForTests(
  request,
  parent,
  isMain,
  options
) {
  if (request === "server-only") return serverOnlyStub;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
