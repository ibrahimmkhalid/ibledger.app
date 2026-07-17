// DEV_TESTING removes Clerk from the request path entirely and resolves every
// request to a hardcoded test user. Gated on NODE_ENV so that setting the env
// var in a production deploy cannot open the app.
export function isDevTestingEnabled() {
  return (
    process.env.DEV_TESTING === "true" && process.env.NODE_ENV !== "production"
  );
}
