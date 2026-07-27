import { stopServer } from "./server-control";

export default async function globalTeardown() {
  await stopServer().catch(() => {});
}
