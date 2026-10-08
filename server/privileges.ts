// Railway mounts volumes as root, and this server runs as the unprivileged `node` user. So the container
// starts as root (RAILWAY_RUN_UID=0) only long enough to hand the data folder to `node`, and the process
// then drops to `node` for good, before it loads or serves anything. Run as `node` already, it does nothing.
import { chownSync, mkdirSync } from "node:fs";

const NODE_UID = 1000;
const NODE_GID = 1000;

if (process.getuid?.() === 0) {
  const dir = process.env.DATA_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    chownSync(dir, NODE_UID, NODE_GID);
  }
  process.setgroups?.([]);
  process.setgid?.(NODE_GID);
  process.setuid?.(NODE_UID);
}
