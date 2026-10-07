import { loadConfig } from "./config";
import { startGameServer } from "./server";

const server = await startGameServer(loadConfig());

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}
