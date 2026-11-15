import { PrismaClient } from "@prisma/client";

const noOp = {
  findMany: async () => [],
  findFirst: async () => null,
  findUnique: async () => null,
  create: async (d) => d?.data ?? {},
  createMany: async () => ({ count: 0 }),
  update: async (d) => d?.data ?? {},
  upsert: async (d) => d?.create ?? d?.update ?? {},
  delete: async () => ({}),
  deleteMany: async () => ({ count: 0 }),
  count: async () => 0,
};

function createMockPrisma() {
  console.warn("[AI Studio] Database not connected — using mock");
  return new Proxy(
    {},
    {
      get: (_, prop) => {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        if (prop === "$transaction") {
          return async (ops) => (Array.isArray(ops) ? Promise.all(ops) : []);
        }
        if (prop === "$connect" || prop === "$disconnect") {
          return async () => {};
        }
        return noOp;
      },
    }
  );
}

function wrapClient(client) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "then" || typeof prop === "symbol") return undefined;
      const val = Reflect.get(target, prop);
      if (prop === "$transaction") {
        return async (...args) => {
          try {
            return await val.apply(target, args);
          } catch (err) {
            if (err?.name === "PrismaClientInitializationError" || err?.code === "P1001") {
              return Array.isArray(args[0]) ? Promise.all(args[0]) : [];
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
            return async (...args) => {
              try {
                return await fn.apply(modelTarget, args);
              } catch (err) {
                if (
                  err?.name === "PrismaClientInitializationError" ||
                  err?.code === "P1001" ||
                  String(err?.message || "").includes("Can't reach database server")
                ) {
                  return noOp[method] ? noOp[method](...args) : null;
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

