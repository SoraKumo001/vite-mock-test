import { Test01_1, Test01_2 } from "./test01";
import { Test02_1, Test02_2 } from "./test02";
import { Test04_1 } from "./test04";
import { Test05_1, Test05_2 } from "./test05";

import * as Test01 from "./test01";
import * as Test02 from "./test02";
import * as Test03 from "./test03";
import * as Test04 from "./test04";
import * as Test05 from "./test05";
import * as Test06 from "./test06";
import * as Test07 from "./test07";
import * as Test08 from "./test08";
import * as Test09 from "./test09";
import * as Test10 from "./test10";

(Test01 as any).___setMock("Test01", () => console.log("mock01"));

Test01_1();
Test01_2();

Test02_1();
Test02_2();

Test04_1();

Test05_1();
Test05_2();

console.log(Test01);
console.log(Test02);
console.log(Test03);
console.log(Test04);
console.log(Test05);
console.log(Test06);
console.log(Test07);
console.log(Test08);
console.log(Test09);
console.log(Test10);
