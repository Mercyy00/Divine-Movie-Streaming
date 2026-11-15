import { PrismaClient } from "@prisma/client";

const noOp = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d) => d?.data ?? {},
  createMany: async () => ({ count: 0 }),
  update: async (d) => d?.data ?? {},
  updateMany: async () => ({ count: 0 }),
  upsert: async (d) => d?.create ?? d?.update ?? {},
  delete: async () => ({}),
  deleteMany: async () => ({ count: 0 }),
  count: async () => 0,
  aggregate: async () => ({}),
  groupBy: async () => [],
};

function createMockPrisma() {
  console.warn("[AI Studio] Database not connected — using mock");
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        if (prop === "$transaction") {
          return async (ops) => {
            if (typeof ops === "function") return ops(createMockPrisma());
            return Array.isArray(ops) ? Promise.all(ops) : [];
          };
        }
        if (prop === "$connect" || prop === "$disconnect") {
          return async () => {};
        }
        return noOp;
      },
    }
  );
}

export function isPrismaUnavailableError(err) {
  const code = err?.code;
  const msg = String(err?.message || "");
  return (
    err?.name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1003" ||
    code === "P2021" ||
    code === "P2022" ||
    msg.includes("Can't reach database server") ||
    msg.includes("does not exist in the current database") ||
    msg.includes("Environment variable not found: DATABASE_URL")
  );
}

const rawPromises = new WeakMap();

function wrapPrismaPromise(rawPromise, method, args) {
  if (!rawPromise || typeof rawPromise.then !== "function") return rawPromise;
  const proxy = new Proxy(rawPromise, {
    get(target, prop) {
      if (prop === "then") {
        return (onFulfilled, onRejected) =>
          target.then(onFulfilled, (err) => {
            if (isPrismaUnavailableError(err)) {
              const fallback = noOp[method] ? noOp[method](...args) : Promise.resolve(null);
              return Promise.resolve(fallback).then(onFulfilled, onRejected);
            }
            if (typeof onRejected === "function") return onRejected(err);
            throw err;
          });
      }
      if (prop === "catch") {
        return (onRejected) =>
          target.then(undefined, (err) => {
            if (isPrismaUnavailableError(err)) {
              return noOp[method] ? noOp[method](...args) : null;
            }
            if (typeof onRejected === "function") return onRejected(err);
            throw err;
          });
      }
      const val = Reflect.get(target, prop);
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
  rawPromises.set(proxy, rawPromise);
  return proxy;
}

function wrapClient(client) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "then" || typeof prop === "symbol") return undefined;
      const val = Reflect.get(target, prop);
      if (prop === "$transaction") {
        return async (...args) => {
          const first = args[0];
          const unwrappedArgs = Array.isArray(first)
            ? [first.map((item) => rawPromises.get(item) || item), ...args.slice(1)]
            : args;
          try {
            return await val.apply(target, unwrappedArgs);
          } catch (err) {
            if (isPrismaUnavailableError(err)) {
              if (typeof first === "function") return [];
              if (Array.isArray(first)) {
                return Promise.all(
                  first.map((item) => Promise.resolve(item).catch(() => null))
                );
              }
              return [];
            }
            throw err;
          }
        };
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        return new Proxy(val, {
          get(modelTarget, method) {
            const fn = Reflect.get(modelTarget, method);
            if (typeof fn !== "function") return fn;
            return (...args) => {
              try {
                const rawPromise = fn.apply(modelTarget, args);
                return wrapPrismaPromise(rawPromise, method, args);
              } catch (err) {
                if (isPrismaUnavailableError(err)) {
                  return noOp[method] ? noOp[method](...args) : Promise.resolve(null);
                }
                throw err;
              }
            };
          },
        });
      }
      return typeof val === "function" ? val.bind(target) : val;
    },
  });
}

const g = globalThis;
let prisma;
if (!process.env.DATABASE_URL) {
  prisma = g.__prisma || createMockPrisma();
} else {
  try {
    prisma = g.__prisma || wrapClient(new PrismaClient());
  } catch {
    prisma = createMockPrisma();
  }
}
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

export { prisma };
