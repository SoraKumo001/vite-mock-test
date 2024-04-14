import fs from "fs";
import { Plugin } from "vite";
import { ExportSpecifier, Program, Statement, parse } from "acorn";
import { generate } from "astring";
import path from "path";
const ___DEBUG = true;
const DEFAULT = "___default___";

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
          node.declaration?.type === "ClassDeclaration" &&
          node.declaration.id.type === "Identifier"
        ) {
          const name = node.declaration.id.name;
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
                  v.exported.name === "default" ? DEFAULT : v.exported.name,
                  v.local.name,
                ] as const,
              ];
            }
            return [];
          });
          names.forEach(([name, value]) => {
            exports[name] = value;
          });
        }

        return [];
      }

      if (node.type === "ExportDefaultDeclaration") {
        if (
          (node.declaration.type === "FunctionDeclaration" ||
            node.declaration.type === "ClassDeclaration") &&
          node.declaration.id
        ) {
          exports[DEFAULT] = node.declaration.id.name;
          return [node.declaration];
        }
        if (
          node.declaration.type === "ArrowFunctionExpression" ||
          node.declaration.type === "FunctionDeclaration" ||
          node.declaration.type === "Literal" ||
          node.declaration.type === "ClassDeclaration" ||
          node.declaration.type === "ObjectExpression"
        ) {
          exports[DEFAULT] = DEFAULT;
          return {
            type: "VariableDeclaration",
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "Identifier",
                  name: DEFAULT,
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
        if (
          node.declaration.type === "CallExpression" &&
          node.declaration.callee.type === "Identifier"
        ) {
          exports[DEFAULT] = node.declaration.callee.name;
          return {
            type: "VariableDeclaration",
            declarations: [
              {
                type: "VariableDeclarator",
                id: {
                  type: "Identifier",
                  name: DEFAULT,
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
        if (node.declaration.type === "Identifier") {
          exports[DEFAULT] = node.declaration.name;
          return [];
        }
        console.log(node);
        throw new Error("Not implemented");
      }
      return [node];
    });
  }
  return exports;
}

const convertPrivate = (ast: Program) => {
  const outsides = [
    "ExportAllDeclaration",
    "ImportDeclaration",
    // "ExpressionStatement",
  ];
  const imports = ast.body.filter(
    (node) =>
      outsides.includes(node.type) ||
      ("source" in node && node.source) ||
      (node.type === "ExpressionStatement" && node.directive)
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
            const func = (...params) => {
              console.log(Object.entries(value));
              const f = funcMap[key];
              return f(...params);
            };
            Object.entries(value).forEach(([k, v]) => {
              func[k] = v;
            });
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
      fs.rmSync("tmp", { recursive: true });
    }
    fs.mkdirSync("tmp", { recursive: true });
  }
  return {
    name: "code-out",
    transform(code, id) {
      //ts||js
      if (!id.match(/\.(ts|js|tsx|jsx)(\?.*)?$/)) {
        return null;
      }
      if (id.startsWith("/virtual:")) {
        return null;
      }
      if (id.startsWith("@storybook")) {
        return null;
      }
      try {
        const ast = parse(code, { sourceType: "module", ecmaVersion: 2020 });

        const exports = removeExport(ast);

        const namedExports = Object.entries(exports).filter(
          ([name]) => name !== DEFAULT
        );
        if (Object.keys(exports).length) {
          const insertMockAst = parse(
            `${createMock}
            return ___createMock({${Object.entries(exports)
              .map(([name, value]) =>
                name === value ? name : `${name}: ${value}`
              )
              .join(", ")}});
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

          const exportAst = parse(
            `export const {${[...namedExports, ["___setMock"]]
              .map(([name]) => name)
              .join(", ")}} = ___exports;` +
              (Object.keys(exports).find((v) => v === DEFAULT)
                ? `\nexport default ___exports.${DEFAULT}`
                : ""),
            {
              sourceType: "module",
              ecmaVersion: 2020,
            }
          );
          ast.body.push(...exportAst.body);
        }
        const newCode = generate(ast);
        if (___DEBUG) {
          const p = path.relative(
            path.normalize(path.resolve("./")),
            path.normalize(id.split("?")[0].replaceAll("\0", ""))
          );
          const name = p
            .replaceAll("/", "-")
            .replaceAll("\\", "-")
            .replaceAll(":", "-")
            .replaceAll("?", "-");

          fs.writeFileSync(`tmp/${name}`, code);
          fs.writeFileSync(`tmp/${name}.json`, JSON.stringify(ast, null, 2));
          fs.writeFileSync(`tmp/${name}-out.js`, newCode);
        }
        return newCode;
      } catch (e) {
        console.log("==============================");
        console.log(id);
        console.log(e);
      }
      return null;
    },
  };
};
