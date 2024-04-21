import type { ___setMock } from "./___mock.js";

const setMock = (globalThis as typeof globalThis & { ___setMock: ___setMock })
  .___setMock;

export { setMock };
