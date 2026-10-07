/** Enforces the package boundaries from CLAUDE.md (rules 1-2). */
const PURE = "^packages/(game-core|game-protocol|game-data|sim-host)/";

module.exports = {
  forbidden: [
    {
      name: "pure-no-renderer-or-ui",
      comment:
        "Simulation packages must not depend on Babylon, React or the DOM-bound packages.",
      severity: "error",
      from: { path: PURE },
      to: {
        // Match both resolved (node_modules/.pnpm/@babylonjs+core@x) and
        // unresolved (bare "@babylonjs/core") specifiers.
        path: [
          "(^|/)@babylonjs[/+]",
          "(^|/)react(-dom)?([/@+]|$)",
          "(^|/)zustand([/@+]|$)",
          "^packages/(babylon-renderer|input|asset-runtime)/",
          "^apps/",
        ],
      },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|node_modules|public)/" },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      extensions: [".ts", ".tsx", ".js"],
    },
  },
};
