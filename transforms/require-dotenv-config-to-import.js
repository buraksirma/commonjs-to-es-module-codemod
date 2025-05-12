/**
 * Transform
 *   require('dotenv').config()
 * to
 *   import dotenv from 'dotenv';
 *   dotenv.config();
 */

import Logger from "./utils/logger";
import { isTopNode } from "./utils/filters";

function transformer(file, api, options) {
    const j = api.jscodeshift;
    const logger = new Logger(file, options);

    // Find all require('dotenv').config() calls
    const root = j(file.source);
    const dotenvCalls = root
        .find(j.ExpressionStatement, {
            expression: {
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    object: {
                        type: "CallExpression",
                        callee: { name: "require" },
                        arguments: [{ value: "dotenv" }]
                    },
                    property: { name: "config" }
                }
            }
        })
        .filter(path => isTopNode(j, path));

    if (dotenvCalls.length === 0) return file.source;

    logger.log(`${dotenvCalls.length} dotenv require().config() calls will be transformed`);

    // Replace require('dotenv').config() with dotenv.config()
    dotenvCalls.replaceWith(
        j.expressionStatement(
            j.callExpression(
                j.memberExpression(
                    j.identifier("dotenv"),
                    j.identifier("config")
                ),
                []
            )
        )
    );

    // Check if import dotenv from 'dotenv' already exists
    const hasDotenvImport = root.find(j.ImportDeclaration, {
        source: { value: "dotenv" }
    }).size() > 0;

    if (!hasDotenvImport) {
        // Insert import at the top, after any existing import statements
        const firstImport = root.find(j.ImportDeclaration).at(0);
        const dotenvImport = j.importDeclaration(
            [j.importDefaultSpecifier(j.identifier("dotenv"))],
            j.literal("dotenv")
        );
        if (firstImport.size() > 0) {
            firstImport.insertBefore(dotenvImport);
        } else {
            root.get().node.program.body.unshift(dotenvImport);
        }
    }

    return root.toSource();
}

export default transformer; 