// Each service imports only its own env (e.g. `import { apiEnv } from "@socialfly/config"`).
// They are separate modules, not one merged schema, because each is validated at
// import time: one service must never fail its boot over another service's variables.
export { type ApiEnv, apiEnv } from "./api";
export { type AuthEnv, authEnv } from "./auth";
export { isProduction } from "./shared";
export { type WorkerEnv, workerEnv } from "./worker";
