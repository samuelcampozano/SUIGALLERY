const VALID_ENVIRONMENTS = new Set(["sandbox", "production", "test"]);

/**
 * Keep deployment intent separate from NODE_ENV. A sandbox still uses
 * production HTTP hardening, while production must never use sandbox storage.
 */
export function deploymentEnvironment(env = process.env) {
  const configured = env.NODUS_DEPLOYMENT_ENV?.trim().toLowerCase();
  if (configured) {
    if (!VALID_ENVIRONMENTS.has(configured)) {
      throw new Error("NODUS_DEPLOYMENT_ENV must be sandbox, production, or test");
    }
    return configured;
  }

  return env.NODE_ENV === "test" ? "test" : env.NODE_ENV === "production" ? "production" : "sandbox";
}

export function isProductionDeployment(env = process.env) {
  return deploymentEnvironment(env) === "production";
}

export function allowsSandboxStorage(env = process.env) {
  return !isProductionDeployment(env);
}
