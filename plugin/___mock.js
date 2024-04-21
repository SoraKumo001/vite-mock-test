const funcMap = {};
const ___setMock = (func, custom) => {
    const key = "___symbol" in func && func.___symbol;
    if (!key)
        throw new Error("Function is not a mock");
    funcMap[key] = { ...funcMap[key], custom };
};
globalThis.___setMock = ___setMock;
const ___createMock = (exp) => {
    const v = Object.entries(exp).map(([key, original]) => {
        if (typeof original === "function") {
            const ___symbol = Symbol(key);
            const func = (...params) => {
                const f = funcMap[func.___symbol].custom;
                return f(...params);
            };
            func.___symbol = ___symbol;
            funcMap[___symbol] = { original, custom: original };
            Object.entries(original).forEach(([k, v]) => {
                func[k] = v;
            });
            Object.defineProperty(func, "name", { value: original.name });
            return [key, func];
        }
        return [key, original];
    });
    return Object.fromEntries(v);
};
globalThis.___createMock = ___createMock;
const ___createCommonMock = (exp) => {
    if (typeof exp !== "object")
        return exp;
    if (exp.prototype?.constructor === exp) {
        return exp;
    }
    if (typeof exp === "function") {
        const func = ((...args) => {
            return exp(...args);
        }).bind(exp);
        Object.setPrototypeOf(func, Object.getPrototypeOf(exp));
        return Object.assign(func, exp);
    }
    const prototype = Object.getPrototypeOf(exp);
    const clonedObject = Object.create(prototype);
    return Object.assign(clonedObject, exp);
};
globalThis.___createCommonMock = ___createCommonMock;
export {};
