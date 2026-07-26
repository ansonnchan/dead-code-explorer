/**
 * @typedef {{ name: string }} User
 */

/**
 * @param {User} user
 * @returns {string}
 */
export function formatUser(user) {
  return user.name.toUpperCase();
}

/** @returns {string} */
export function unusedLegacyHelper() {
  return "unused";
}
