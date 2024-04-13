import fs from "fs";
import { Plugin } from "vite";
import { ExportSpecifier, Program, Statement, parse } from "acorn";
import { generate } from "astring";

const ___DEBUG = true;

function removeExport(ast: Program) {
  const exports: Record<string, string> = {};
  if (ast.type === "Program") {
    ast.body = ast.body.flatMap((node) => {
      if (node.type === "ExportNamedDeclaration" && !node.source) {
        if (
          node.declaration?.type === "VariableDeclaration" &&
          node.declaration.declarations?.[0].id.type === "Identifier"
        ) {
          const name = node.declaration.declarations[0].id.name;
          exports[name] = name;
          return [node.declaration];
        }
        if (
          node.declaration?.type === "FunctionDeclaration" &&
          node.declaration.id.type === "Identifier"
        ) {
          const name = node.declaration.id.name;
          exports[name] = name;
          return [node.declaration];
        }
        if (node.specifiers) {
          const names = node.specifiers.flatMap((v: ExportSpecifier) => {
            if (
              v.exported.type === "Identifier" &&
              v.local.type === "Identifier"
            ) {
              return [
                [
                  v.exported.name === "default"
                    ? "___default"
                    : v.exported.name,
                  v.local.name,
                ] as const,
              ];
            }
            return [];
          });
          names.forEach(([name, value]) => {
            exports[name] = value;
          });
          const vars = names
            .filter(([name, value]) => name !== value)
            .map(([name, value]) => `const ${name} = ${value};`)
            .join(";\n");
          return parse(vars, {
            sourceType: "module",
            ecmaVersion: 2020,
          }) as never;
        }

        return [];
      }

      if (node.type === "ExportDefaultDeclaration") {
        exports["___default"] = "___default";
        if (
          node.declaration.type === "ArrowFunctionExpression" ||
          node.declaration.type === "FunctionDeclaration" ||
          node.declaration.type === "Literal"
        ) {
          return {
            type: "VariableDeclaration",
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "Identifier",
                  name: "___default",
                  start: node.declaration.start,
                  end: node.declaration.end,
                },
                init: node.declaration as never,

                start: node.start,
                end: node.end,
              },
            ],
            kind: "const",
            start: node.start,
            end: node.end,
          };
        }
      }
      return [node];
    });
  }
  return exports;
}

const convertPrivate = (ast: Program) => {
  const outsides = ["ExportAllDeclaration", "ImportDeclaration"];
  const imports = ast.body.filter(
    (node) => outsides.includes(node.type) || ("source" in node && node.source)
  );
  const exports = ast.body.filter((v) => !imports.includes(v));
  const node: Statement = {
    type: "VariableDeclaration",
    declarations: [
      {
        type: "VariableDeclarator",
        id: {
          type: "Identifier",
          name: "___exports",
          start: ast.body[0].start,
          end: ast.body[0].end,
        },
        init: {
          type: "CallExpression",
          callee: {
            type: "ArrowFunctionExpression",
            async: false,
            params: [],
            body: {
              type: "BlockStatement",
              body: exports as Statement[],
              start: ast.body[0].start,
              end: ast.body[0].end,
            },
            start: ast.body[0].start,
            end: ast.body[0].end,
            generator: false,
            expression: false,
          },
          arguments: [],
          start: ast.body[0].start,
          end: ast.body[0].end,
          optional: true,
        },
        start: ast.body[0].start,
        end: ast.body[0].end,
      },
    ],
    kind: "const",
    start: ast.body[0].start,
    end: ast.body[0].end,
  };

  ast.body = [...imports, node];
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
  if (___DEBUG) {
    if (fs.existsSync("tmp")) {
      fs.rmdirSync("tmp", { recursive: true });
    }
    fs.mkdirSync("tmp", { recursive: true });
  }
  return {
    name: "code-out",
    transform(code, id) {
      //ts||js
      if (!id.match(/\.(ts|js)$/)) {
        return null;
      }
      try {
        const ast = parse(code, { sourceType: "module", ecmaVersion: 2020 });

        const exports = removeExport(ast);
        if (Object.entries(exports).length > 0) {
          const namedExports = Object.entries(exports).filter(
            ([name]) => name !== "___default"
          );
          const insertMockAst = parse(
            `${createMock}
            return ___createMock({${Object.keys(exports).join(", ")}});
            `,
            {
              sourceType: "module",
              ecmaVersion: 2020,
              allowReturnOutsideFunction: true,
              allowImportExportEverywhere: true,
            }
          );
          ast.body.push(...insertMockAst.body);
          convertPrivate(ast);
          if (namedExports.length > 0) {
            const exportAst = parse(
              `export const {${namedExports
                .map(([name, value]) =>
                  name === value ? name : `${value}:${name}`
                )
                .join(", ")}, ___setMock} = ___exports
            ${
              Object.keys(exports).find((v) => v === "___default")
                ? "\nexport default ___exports.___default"
                : ""
            }`,
              {
                sourceType: "module",
                ecmaVersion: 2020,
              }
            );
            ast.body.push(...exportAst.body);
          }
        }

        const newCode = generate(ast);
        if (___DEBUG) {
          const name = id
            .replaceAll("/", "-")
            .replaceAll("\\", "-")
            .replaceAll(":", "-")
            .replaceAll("?", "-")
            .replaceAll("\0", "");
          fs.writeFileSync(`tmp/${name}`, code);
          fs.writeFileSync(`tmp/${name}.json`, JSON.stringify(ast, null, 2));
          fs.writeFileSync(`tmp/${name}-out.js`, newCode);
        }
        return newCode;
      } catch (e) {
        console.log(id);
        console.log(e);
      }
      return null;
    },
  };
};
