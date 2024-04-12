import { Test01, Test02 } from "./test";
import * as Test from "./test";

(Test as any).___setMock("Test01", () => console.log("mock01"));

Test01();
Test02();
