/// <reference lib="webworker" />
/**
 * Runs the authoritative simulation off the main thread (roadmap M2) so
 * rendering hitches never slow the sim and vice versa.
 */
import {
  LocalSimHost,
  type MessageEndpoint,
  serveSimHost,
} from "@rpg/sim-host";
import { loadContent } from "./content";
import { navFor } from "./nav";

// The page passes start parameters through the worker name (static URL keeps Vite bundling happy).
const params = JSON.parse(self.name || "{}") as {
  map?: string;
  character?: string;
};
const host = new LocalSimHost({
  content: loadContent(),
  mapId: params.map ?? "map_sandbox_01",
  characterId: params.character ?? "player_default",
  navFor,
});
serveSimHost(self as unknown as MessageEndpoint, host);
