import { BadRequestError } from "@/app/api/query-params";

export type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new BadRequestError("Invalid JSON body");
  }

  return value;
}

export async function parseRequestJsonObject(request: Request) {
  try {
    return parseJsonObject(await request.json());
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    throw new BadRequestError("Invalid JSON body");
  }
}

export function parseNullableNumber(
  input: unknown,
  name: string,
): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

export function parseNullableId(input: unknown, name: string): number | null {
  const value = parseNullableNumber(input, name);
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

export function parseRequiredId(input: unknown, name: string): number {
  const value = parseNullableId(input, name);
  if (value === null) {
    throw new BadRequestError(`Missing ${name}`);
  }

  return value;
}

export function parseIdArray(input: unknown, name: string): number[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return input.map((value) => {
    const id = parseNullableId(value, name);
    if (id === null) {
      throw new BadRequestError(`Invalid ${name}`);
    }

    return id;
  });
}

export function parseObjectArray(input: unknown, name: string): JsonObject[] {
  if (input === undefined || input === null) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return input.map((entry) => {
    if (!isJsonObject(entry)) {
      throw new BadRequestError(`Invalid ${name}`);
    }

    return entry;
  });
}

export function parseRequiredName(input: unknown, name: string): string {
  if (input === undefined || input === null || input === "") {
    throw new BadRequestError(`Missing ${name}`);
  }

  if (typeof input !== "string") {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return input;
}

export function parseOptionalName(
  input: unknown,
  name: string,
): string | undefined {
  if (input === undefined || input === null || input === "") {
    return undefined;
  }

  return parseRequiredName(input, name);
}
