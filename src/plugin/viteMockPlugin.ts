import fs from "fs";
import { Plugin } from "vite";
import {
  AssignmentExpression,
  ExportSpecifier,
  Program,
  Statement,
  parse,
} from "acorn";
import { generate } from "astring";
import { simple } from "acorn-walk";
import path from "path";

const DEFAULT = "___default___";
const virtualMockName = "virtual:___mock.js";

function convertCommonJS(ast: Program) {
  let type: "module" | "exports" | undefined = undefined;
  simple(ast, {
    AssignmentExpression(node: AssignmentExpression, state: unknown) {
      if (
        node.left.type === "MemberExpression" &&
        node.left.object.type === "Identifier"
      ) {
        if (
          node.left.object.name === "module" &&
          node.left.property.type === "Identifier" &&
          node.left.property.name === "exports"
        ) {
          // const n: Identifier = {
          //   type: "Identifier",
          //   name: "___exports",
          //   start: node.left.start,
          //   end: node.left.end,
          // };
          // node.left = n;
          type = "module";
        } else if (node.left.object.name === "exports") {
          // node.left.object.name = "___exports";
          type = "exports";
        }
      }
    },
  });
  if (type) {
    // simple(ast, {
    //   Identifier(node) {
    //     if (node.name === "exports") {
    //       node.name = "___exports";
    //     }
    //   },
    //   MemberExpression(node) {
    //     // nodeのobjectが`module`で、propertyが`exports`である場合
    //     if (
    //       node.object.type === "Identifier" &&
    //       node.object.name === "module" &&
    //       node.property.type === "Identifier" &&
    //       node.property.name === "exports"
    //     ) {
    //       const n: Identifier = node as never;
    //       // nodeを変更して`___exports`に置換
    //       n.type = "Identifier";
    //       n.name = "___exports"; // `module`を`___exports`に変更
    //     }
    //   },
    // });

    const header = parse(`require("${virtualMockName}");`, {
      sourceType: "module",
      ecmaVersion: 2020,
    });
    const exports = type === "module" ? "module.exports" : "exports";
    const footer = parse(`${exports} = ___createCommonMock(${exports})`, {
      sourceType: "module",
      ecmaVersion: 2020,
    });
    const index = ast.body.findIndex(
      (v) => v.type !== "ExpressionStatement" || !v.directive
    );
    ast.body.splice(Math.max(0, index), 0, ...header.body);
    ast.body.push(...footer.body);
  }
  return type;
}

function isCommonJSWrap(ast: Program) {
  const VariableDeclaration = ast.body[0];
  const ExportNamedDeclaration = ast.body[1];
  if (VariableDeclaration?.type === "VariableDeclaration") {
    const declaration = VariableDeclaration.declarations[0];
    if (
      declaration?.init?.type === "ObjectExpression" &&
      declaration.init.properties.length === 0
    ) {
      if (ExportNamedDeclaration?.type === "ExportNamedDeclaration") {
        const specifier = ExportNamedDeclaration.specifiers[0];

        return (
          specifier?.exported.type === "Identifier" &&
          (specifier.exported.name === "__exports" ||
            specifier.exported.name === "__module")
        );
      }
    }
  }
  return false;
}

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
  const outsides = ["ExportAllDeclaration", "ImportDeclaration"];
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

export const viteMockPlugin = (props?: { debug?: boolean }): Plugin => {
  const { debug } = props ?? {};
  const ___DEBUG = debug ?? false;
  if (___DEBUG) {
    if (fs.existsSync("tmp")) {
      fs.rmSync("tmp", { recursive: true });
    }
    fs.mkdirSync("tmp", { recursive: true });
  }
  return {
    name: "code-out",
    resolveId(id) {
      if (id === virtualMockName) {
        return virtualMockName;
      }
      return null;
    },
    load(id) {
      if (id === virtualMockName) {
        const code = fs.readFileSync(
          path.resolve(__dirname, "___mock.js"),
          "utf-8"
        );
        return code;
      }
    },
    transform(code, id) {
      //ts||js
      if (!id.match(/\.(ts|js)(\?.*)?$/)) {
        return null;
      }
      if (id.startsWith("/virtual:")) {
        return null;
      }
      if (id === virtualMockName) {
        return null;
      }
      if (id.includes("@storybook")) {
        return null;
      }
      const ast = parse(code, { sourceType: "module", ecmaVersion: "latest" });
      const p = path.relative(
        path.normalize(path.resolve("./")),
        path.normalize(id.replaceAll("?", "-").replaceAll("\0", ""))
      );
      const name = p
        .replaceAll("/", "-")
        .replaceAll("\\", "-")
        .replaceAll(":", "-")
        .replaceAll("?", "-");
      try {
        if (isCommonJSWrap(ast)) {
          return null;
        }

        if (___DEBUG) {
          fs.writeFileSync(`tmp/${name}`, code);
          fs.writeFileSync(`tmp/${name}.json`, JSON.stringify(ast, null, 2));
        }

        const exports = removeExport(ast);
        if (Object.keys(exports).length) {
          const namedExports = Object.entries(exports).filter(
            ([name]) => name !== DEFAULT
          );
          if (Object.keys(exports).length) {
            const insertMockAst = parse(
              `import {} from "${virtualMockName}";
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
              (namedExports.length
                ? `export const {${namedExports
                    .map(([name]) => name)
                    .join(", ")}} = ___exports;`
                : "") +
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
        } else {
          convertCommonJS(ast);
        }
        const newCode = generate(ast);
        if (___DEBUG) {
          fs.writeFileSync(`tmp/${name}-out.js`, newCode);
        }
        return newCode;
      } catch (e) {
        if (___DEBUG) {
          fs.writeFileSync(
            `tmp/${name}-error.json`,
            JSON.stringify(ast, null, 2)
          );
        }
        console.log("==============================");
        console.log(id);
        console.log(e);
      }
      return null;
    },
  };
};
