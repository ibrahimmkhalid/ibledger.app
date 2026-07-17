export class BadRequestError extends Error {}

export function parseIntegerParam(
  searchParams: URLSearchParams,
  name: string,
  fallback: number,
) {
  const raw = searchParams.get(name);
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

export function parseEnumParam<T extends string>(
  searchParams: URLSearchParams,
  name: string,
  allowed: readonly T[],
  fallback: T,
) {
  const raw = searchParams.get(name);
  if (!raw) return fallback;

  if (!allowed.includes(raw as T)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return raw as T;
}

export function parseAmountParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name);
  if (!raw) return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

export function parseIdList(searchParams: URLSearchParams, pluralName: string) {
  const singularName = pluralName.replace(/s$/, "");
  const rawValues = [
    ...searchParams.getAll(pluralName),
    ...searchParams.getAll(singularName),
  ];

  if (rawValues.length === 0) return [];

  const ids = rawValues
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value));

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new BadRequestError(`Invalid ${pluralName}`);
  }

  return Array.from(new Set(ids));
}

export function parseDateParam(searchParams: URLSearchParams, name: string) {
  const raw = searchParams.get(name)?.trim();
  if (!raw) return null;

  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return parsed;
}

function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, "\\$&");
}

// Each term becomes a LIKE pattern with wildcards between every character, so
// "amzn" matches "Amazon". Capped at 8 terms: each one costs a correlated
// subquery per row.
export function fuzzyLikePatterns(search: string) {
  return search
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((term) => `%${Array.from(term).map(escapeLike).join("%")}%`);
}
