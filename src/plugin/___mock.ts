export type ___setMock = typeof ___setMock;

const funcMap: Record<symbol, { original: Function; custom: Function }> = {};
const ___setMock = (func: Function, custom: Function) => {
  const key = "___symbol" in func && (func.___symbol as symbol);
  if (!key) throw new Error("Function is not a mock");
  funcMap[key] = { ...funcMap[key], custom };
};

(
  globalThis as typeof globalThis & { ___setMock: typeof ___setMock }
).___setMock = ___setMock;

const ___createMock = (exp: Record<string, unknown>) => {
  const v = Object.entries(exp).map(([key, original]) => {
    if (typeof original === "function") {
      const ___symbol = Symbol(key);
      const func = (...params: unknown[]) => {
        const f = funcMap[func.___symbol].custom;
        return f(...params);
      };
      func.___symbol = ___symbol;

      funcMap[___symbol] = { original, custom: original };
      Object.entries(original).forEach(([k, v]) => {
        func[k as keyof typeof func] = v;
      });
      Object.defineProperty(func, "name", { value: original.name });
      return [key, func];
    }
    return [key, original];
  });
  return Object.fromEntries(v);
};

(
  globalThis as typeof globalThis & { ___createMock: typeof ___createMock }
).___createMock = ___createMock;

const ___createCommonMock = (exp: NodeJS.Module["exports"]) => {
  if (typeof exp !== "object") return exp;

  if (exp.prototype?.constructor === exp) {
    return exp;
  }

  if (typeof exp === "function") {
    const func = ((...args: unknown[]) => {
      return exp(...args);
    }).bind(exp);
    Object.setPrototypeOf(func, Object.getPrototypeOf(exp));
    return Object.assign(func, exp);
  }
  const prototype = Object.getPrototypeOf(exp);
  const clonedObject = Object.create(prototype);
  return Object.assign(clonedObject, exp);
};

(
  globalThis as typeof globalThis & {
    ___createCommonMock: typeof ___createCommonMock;
  }
).___createCommonMock = ___createCommonMock;
