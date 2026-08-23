// DEV_TESTING resolves every request to a hardcoded test user, gated on
// NODE_ENV so a production deploy cannot turn it on.
export function isDevTestingEnabled() {
  return (
    process.env.DEV_TESTING === "true" && process.env.NODE_ENV !== "production"
  );
}
