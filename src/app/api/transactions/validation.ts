import {
  JsonObject,
  parseJsonObject,
  parseNullableId,
  parseNullableNumber,
} from "@/app/api/json-body";
import { BadRequestError } from "@/app/api/query-params";

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
      line.isPending === undefined
        ? fallbackIsPending
        : Boolean(line.isPending),
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
    const transactionId = parseNullableId(
      record.transactionId,
      "transactionId",
    );

    return {
      ...parseLineBase(record, fallbackIsPending),
      transactionId,
    };
  });
}
