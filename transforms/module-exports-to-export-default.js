/**
 * Transform
 *
 *   module.exports = *;
 *
 * to
 *
 *   export default *;
 *
 * Only on global context
 */

import Logger from "./utils/logger";
import { isTopNode } from "./utils/filters";

function transformer(file, api, options) {
    const j = api.jscodeshift;
    const _isTopNode = (path) => isTopNode(j, path);
    const logger = new Logger(file, options);

    // ------------------------------------------------------------------ SEARCH
    const nodes = j(file.source)
        .find(j.ExpressionStatement, {
            expression: {
                left: {
                    object: {
                        name: "module"
                    },
                    property: {
                        name: "exports"
                    }
                },
                operator: "="
            }
        })
        .filter(_isTopNode);

    if (nodes.length > 1) {
        logger.error(
            "There should not be more than one `module.exports` declaration in a file. Aborting transformation"
        );
        return file.source;
    }

    logger.log(`${nodes.length} nodes will be transformed`);

    // ----------------------------------------------------------------- REPLACE
    return nodes
        .replaceWith((path) => {
            const right = path.node.expression.right;
            if (right.type === "ObjectExpression") {
                const j = api.jscodeshift;
                const properties = right.properties;

                // Collect all declared identifiers in the file
                const declaredNames = new Set();
                j(file.source)
                    .find(j.VariableDeclarator)
                    .forEach(p => {
                        if (p.node.id.type === "Identifier") {
                            declaredNames.add(p.node.id.name);
                        }
                    });
                j(file.source)
                    .find(j.FunctionDeclaration)
                    .forEach(p => {
                        if (p.node.id && p.node.id.type === "Identifier") {
                            declaredNames.add(p.node.id.name);
                        }
                    });
                j(file.source)
                    .find(j.ClassDeclaration)
                    .forEach(p => {
                        if (p.node.id && p.node.id.type === "Identifier") {
                            declaredNames.add(p.node.id.name);
                        }
                    });

                // Also collect all imported identifiers (ESM)
                j(file.source)
                    .find(j.ImportDeclaration)
                    .forEach(p => {
                        p.node.specifiers.forEach(spec => {
                            if (spec.local && spec.local.type === "Identifier") {
                                declaredNames.add(spec.local.name);
                            }
                        });
                    });

                // Also collect all destructured require() identifiers (CommonJS)
                j(file.source)
                    .find(j.VariableDeclarator)
                    .forEach(p => {
                        if (
                            p.node.id.type === "ObjectPattern" &&
                            p.node.init &&
                            (
                                (p.node.init.type === "CallExpression" &&
                                 p.node.init.callee.type === "Identifier" &&
                                 p.node.init.callee.name === "require")
                            )
                        ) {
                            p.node.id.properties.forEach(prop => {
                                if (prop.type === "Property" && prop.key.type === "Identifier") {
                                    declaredNames.add(prop.key.name);
                                }
                            });
                        }
                    });

                // Prepare arrays for const declarations and export specifiers
                const constDeclarations = [];
                const allSpecifiers = [];
                properties.forEach((prop) => {
                    // Only handle normal, non-computed, non-spread properties with Identifier keys
                    if (
                        prop.type !== "Property" ||
                        prop.computed ||
                        prop.key.type !== "Identifier"
                    ) {
                        // skip spread, computed, or non-Identifier keys
                        return;
                    }
                    const keyName = prop.key.name;
                    // Simple property: export as is
                    if (
                        prop.value.type === "Identifier" &&
                        prop.key.name === prop.value.name
                    ) {
                        allSpecifiers.push(
                            j.exportSpecifier.from({
                                exported: j.identifier(keyName),
                                local: j.identifier(keyName),
                            })
                        );
                    } else {
                        // Complex property
                        if (declaredNames.has(keyName)) {
                            // Conflict: use _ suffix for internal variable
                            const internalName = keyName + "_";
                            constDeclarations.push(
                                j.variableDeclaration("const", [
                                    j.variableDeclarator(
                                        j.identifier(internalName),
                                        prop.value
                                    ),
                                ])
                            );
                            allSpecifiers.push(
                                j.exportSpecifier.from({
                                    exported: j.identifier(keyName),
                                    local: j.identifier(internalName),
                                })
                            );
                        } else {
                            // No conflict: use original name
                            constDeclarations.push(
                                j.variableDeclaration("const", [
                                    j.variableDeclarator(
                                        j.identifier(keyName),
                                        prop.value
                                    ),
                                ])
                            );
                            allSpecifiers.push(
                                j.exportSpecifier.from({
                                    exported: j.identifier(keyName),
                                    local: j.identifier(keyName),
                                })
                            );
                        }
                    }
                });

                const exportNamed = j.exportNamedDeclaration(null, allSpecifiers);
                exportNamed.comments = path.node.comments;

                // Force multiline for long export lists
                if (allSpecifiers.length > 2) {
                    exportNamed.loc = { // This is a hack to force jscodeshift to print multiline
                        start: { line: 0, column: 0 },
                        end: { line: 0, column: 0 }
                    };
                    // Optionally, you can add a custom property to signal multiline, if you want to handle it in a custom printer
                }

                // Return an array: consts + export
                return [...constDeclarations, exportNamed];
            } else {
                // export default ...
                const newNode = j.exportDefaultDeclaration(right);
                newNode.comments = path.node.comments;
                return newNode;
            }
        })
        .toSource({ quote: "single", wrapColumn: 120 })
        // Post-process to force multiline export for named exports with >2 specifiers
        .replace(
            /export\s*{\s*([^}]+?)\s*};?/g,
            (match, exports) => {
                // Split by comma, trim, and filter out empty
                const names = exports.split(',').map(s => s.trim()).filter(Boolean);
                if (names.length > 2) {
                    return (
                        'export {\n' +
                        names.map(n => '    ' + n + ',').join('\n') +
                        '\n};'
                    );
                }
                // Otherwise, keep as is
                return match;
            }
        );
}

export default transformer;
