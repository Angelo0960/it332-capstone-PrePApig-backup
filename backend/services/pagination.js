export const pagination = (query) => {
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
    const error = new Error('limit must be 1-500 and offset must be 0-1000000');
    error.status = 400;
    throw error;
  }
  return { limit, offset };
};

// Walk every database page for exports and legacy analytics, avoiding the server row cap.
export const collectPages = async (makeQuery) => {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
};
