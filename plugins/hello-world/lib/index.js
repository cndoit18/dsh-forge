/**
 * dsh-forge hello-world plugin, host half.
 *
 * The package contributes browser presentation only: the Loader row exists so
 * client-modules discovers the package manifest (`dsh.client` declaration) and
 * serves `lib/client.js` at `/plugins/dsh-forge-plugin-hello-world/client.js`.
 * Named exports only — a default export would make the Loader discard the
 * function plugin's namespace.
 */

/** Plugin identity for Loader bookkeeping and inspect tools. */
export const name = 'hello-world'

/** Host plugin body — intentionally empty; the browser half owns the feature. */
export function apply() {}
