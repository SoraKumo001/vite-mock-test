import fs from "fs";
import { Plugin } from "vite";
import { Program, parse } from "acorn";
import { generate } from "astring";

function removeExport(ast: Program): string[] {
  const exports: string[] = [];
  if (ast.type === "Program") {
    ast.body = ast.body.map((node: any) => {
      if (node.type === "ExportNamedDeclaration" && node.declaration) {
        const name = node.declaration.declarations[0].id.name;
        exports.push(name);
        return node.declaration;
      }
      return node;
    });
  }
  return exports;
}

const convertPrivate = (ast: Program) => {
  const node = {
    type: "VariableDeclaration",
    declarations: [
      {
        type: "VariableDeclarator",
        id: { type: "Identifier", name: "___exports" },
        init: {
          type: "CallExpression",
          callee: {
            type: "ArrowFunctionExpression",
            async: false,
            params: [],
            body: {
              type: "BlockStatement",
              body: [...ast.body], // 元のASTのボディをIIFEのボディに設定
            },
          },
          arguments: [],
        },
      },
    ],
    kind: "const",
  };

  ast.body = [node] as never;
};

const createMock = `
      const ___createMock = (exp) => {
        const funcMap = {};
        const v = Object.entries(exp).map(([key, value]) => {
          if (typeof value === "function") {
            funcMap[key] = value;
            const func = (...params) => funcMap[key](...params);
            Object.defineProperty(func, "name", { value: value.name });
            return [key, func];
          }
          return [key, value];
        });
        const obj = Object.fromEntries(v);
        Object.defineProperty(obj, "___setMock", {
          value: (key, value) => {
            funcMap[key] = value;
          },
          enumerable: false,
        });
        return obj;
      };`;

export const viteMockPlugin: () => Plugin = () => {
  return {
    name: "code-out",
    transform(code, id) {
      const name = id
        .replaceAll("/", "-")
        .replaceAll("\\", "-")
        .replaceAll(":", "-")
        .replaceAll("?", "-")
        .replaceAll("\0", "");
      try {
        const ast = parse(code, { sourceType: "module", ecmaVersion: 2020 });
        const exports = removeExport(ast);

        if (exports.length > 0) {
          const insertMockAst = parse(
            `${createMock}
            return ___createMock({${exports.join(", ")}});
            `,
            {
              sourceType: "module",
              ecmaVersion: 2020,
              allowReturnOutsideFunction: true,
            }
          );
          ast.body.push(...insertMockAst.body);
          convertPrivate(ast);
          const exportAst = parse(
            `export const {${exports.join(", ")}, ___setMock} = ___exports`,
            {
              sourceType: "module",
              ecmaVersion: 2020,
            }
          );
          ast.body.push(...exportAst.body);
        }

        const newCode = generate(ast);
        // fs.writeFileSync(`tmp/${name}`, code);
        // fs.writeFileSync(`tmp/${name}.json`, JSON.stringify(ast, null, 2));
        // fs.writeFileSync(`tmp/${name}-out.js`, newCode);
        return newCode;
      } catch (e) {
        console.log(e);
      }
      return null;
    },
  };
};
