export class BadRequestError extends Error {}

export type CreateTransactionLineInput = {
  walletId: number;
  fundId: number;
  description: string | null;
  amount: number;
  isPending: boolean;
};

export type UpdateTransactionLineInput = CreateTransactionLineInput & {
  transactionId: number | null;
};

type JsonObject = Record<string, unknown>;

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

export function parseOccurredAt(input: unknown): Date {
  if (input instanceof Date) {
    return input;
  }

  if (typeof input === "string") {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  throw new BadRequestError("Invalid occurredAt");
}

function parseNullableNumber(input: unknown, name: string): number | null {
  if (input === null || input === undefined) {
    return null;
  }

  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

function parseNullableId(input: unknown, name: string): number | null {
  const value = parseNullableNumber(input, name);
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestError(`Invalid ${name}`);
  }

  return value;
}

function parseLineDescription(input: unknown): string | null {
  if (input === undefined || input === null) {
    return null;
  }

  return String(input);
}

function parseLineBase(
  line: JsonObject,
  fallbackIsPending: boolean,
): CreateTransactionLineInput {
  const amount = parseNullableNumber(line.amount, "amount");
  const walletId = parseNullableId(line.walletId, "walletId");
  const fundId = parseNullableId(line.fundId, "fundId");

  if (amount === null || amount === 0) {
    throw new BadRequestError("Invalid amount");
  }

  if (walletId === null || fundId === null) {
    throw new BadRequestError("Line must include walletId and fundId");
  }

  return {
    walletId,
    fundId,
    description: parseLineDescription(line.description),
    amount,
    isPending:
      line.isPending === undefined ? fallbackIsPending : Boolean(line.isPending),
  };
}

export function parseCreateTransactionLines(
  input: unknown,
  fallbackIsPending: boolean,
): CreateTransactionLineInput[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  return input.map((line) =>
    parseLineBase(parseJsonObject(line), fallbackIsPending),
  );
}

export function parseUpdateTransactionLines(
  input: unknown,
  fallbackIsPending: boolean,
): UpdateTransactionLineInput[] | null {
  if (!Array.isArray(input)) {
    return null;
  }

  return input.map((line) => {
    const record = parseJsonObject(line);
    const transactionId = parseNullableId(record.transactionId, "transactionId");

    return {
      ...parseLineBase(record, fallbackIsPending),
      transactionId,
    };
  });
}
