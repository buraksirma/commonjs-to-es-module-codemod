/**
 * Transform
 *
 *   const foo = function() { ... }
 *   const foo = async function() { ... }
 *
 * to
 *
 *   function foo() { ... }
 *   async function foo() { ... }
 */

import Logger from "./utils/logger";
import { isTopNode } from "./utils/filters";

function transformer(file, api, options) {
    const j = api.jscodeshift;
    const logger = new Logger(file, options);

    // Find: const foo = function() { ... } at top-level only
    const nodes = j(file.source)
        .find(j.VariableDeclaration)
        .filter(path => {
            // Only top-level
            if (!isTopNode(j, path)) return false;
            // Only single declarator, const/let, and function expression
            if (path.node.declarations.length !== 1) return false;
            const decl = path.node.declarations[0];
            return (
                (path.node.kind === "const" || path.node.kind === "let") &&
                decl.id.type === "Identifier" &&
                decl.init &&
                decl.init.type === "FunctionExpression" &&
                !decl.init.id // anonymous
            );
        });

    logger.log(`${nodes.length} anonymous function variable(s) will be transformed`);

    return nodes.replaceWith(path => {
        const decl = path.node.declarations[0];
        const func = decl.init;
        // Build a FunctionDeclaration (preserve async/generator)
        const funcDecl = j.functionDeclaration(
            decl.id,
            func.params,
            func.body,
            func.generator,
            func.async
        );
        funcDecl.async = func.async;
        funcDecl.comments = path.node.comments;
        return funcDecl;
    }).toSource({ quote: "single" });
}

export default transformer; 