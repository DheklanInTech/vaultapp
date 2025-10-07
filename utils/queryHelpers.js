export function normalizePagination(limit = '200', offset = '0') {
  let l = parseInt(String(limit), 10);
  if (!Number.isFinite(l)) l = 50; // default
  if (l < 1) l = 1; // clamp minimum
  const limitNum = Math.min(l, 500);

  let o = parseInt(String(offset), 10);
  if (!Number.isFinite(o) || o < 0) o = 0;
  const offsetNum = o;

  return { limitNum, offsetNum };
}

/**
 * Build a WHERE clause sql fragment compatible with a tagged `sql` template function
 * The function expects a `sql` tag and returns a sql fragment that can be interpolated
 * into other `sql` tagged templates. It purposefully avoids `sql.join` so it works
 * with the neon `sql` client.
 */
export function buildUserWhere(sqlTag, status = 'all', q = '') {
  const filters = [];

  if (status === 'active') {
    filters.push(sqlTag`is_frozen = FALSE`);
  } else if (status === 'frozen') {
    filters.push(sqlTag`is_frozen = TRUE`);
  }

  if (q) {
    const like = `%${String(q).toLowerCase()}%`;
    filters.push(sqlTag`(LOWER(username) LIKE ${like} OR LOWER(email) LIKE ${like})`);
  }

  if (!filters.length) return sqlTag``;

  // Reduce into a single sql fragment by interpolating fragments with AND
  let clause = sqlTag`WHERE ${filters[0]}`;
  for (let i = 1; i < filters.length; i++) {
    clause = sqlTag`${clause} AND ${filters[i]}`;
  }
  return clause;
}

export default { normalizePagination, buildUserWhere };
