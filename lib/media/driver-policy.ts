export type MediaDriverEnvironment = {
  driver?: string;
  nodeEnv?: string;
  vercelEnv?: string;
};

export function isProductionDeployment({ nodeEnv, vercelEnv }: MediaDriverEnvironment): boolean {
  return nodeEnv === "production" &&
    (vercelEnv === undefined || vercelEnv === "production");
}

/** Preview/development deployments cannot issue or use production R2 URLs. */
export function canUseR2Media({ driver, nodeEnv, vercelEnv }: MediaDriverEnvironment): boolean {
  return driver === "r2" && isProductionDeployment({ nodeEnv, vercelEnv });
}

export function canUseR2Uploads(env: MediaDriverEnvironment): boolean {
  return canUseR2Media(env);
}

/** Private product files use R2 in production regardless of the image driver. */
export function canUsePrivateR2Media(env: MediaDriverEnvironment): boolean {
  return isProductionDeployment(env);
}
