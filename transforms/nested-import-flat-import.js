/**
 * Transform
 *
 *   const { Models: { User } } = require('../../models')
 *
 * to
 *
 *   const { Models } = require('../../models')
 *   const User = Model.User
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
        .find(j.VariableDeclaration, {
            declarations: [
                {
                    init: {
                        type: "CallExpression",
                        callee: {
                            name: "require"
                        }
                    }
                }
            ]
        })
        .filter(_isTopNode)
        .filter(path => {
            // Filter for declarations with nested destructuring pattern
            const declaration = path.node.declarations[0];
            if (!declaration || !declaration.id || declaration.id.type !== "ObjectPattern") {
                return false;
            }
            
            // Check if any property has a nested pattern
            return declaration.id.properties.some(prop => 
                prop.value && prop.value.type === "ObjectPattern"
            );
        });

    logger.log(`${nodes.length} nodes will be transformed`);

    // ----------------------------------------------------------------- REPLACE
    return nodes
        .replaceWith(path => {
            const declaration = path.node.declarations[0];
            const sourceCode = declaration.init;
            const resultNodes = [];
            
            // Create top-level properties for the new destructuring pattern
            const flatProperties = [];
            
            declaration.id.properties.forEach(prop => {
                if (prop.value && prop.value.type === "ObjectPattern") {
                    // Create a simple property for top-level
                    const flatProp = j.objectProperty(
                        j.identifier(prop.key.name),
                        j.identifier(prop.key.name)
                    );
                    flatProp.shorthand = true;
                    flatProperties.push(flatProp);
                } else {
                    flatProperties.push(prop);
                }
            });
            
            // Create the flattened top-level require
            const flattenedRequire = j.variableDeclaration(
                path.node.kind,
                [j.variableDeclarator(
                    j.objectPattern(flatProperties),
                    sourceCode
                )]
            );
            
            // Preserve comments
            flattenedRequire.comments = path.node.comments;
            resultNodes.push(flattenedRequire);
            
            // Create and add declarations for nested properties
            declaration.id.properties.forEach(prop => {
                if (prop.value && prop.value.type === "ObjectPattern") {
                    prop.value.properties.forEach(nestedProp => {
                        // Create assignment for nested property
                        const varDeclaration = j.variableDeclaration(
                            "const",
                            [j.variableDeclarator(
                                j.identifier(nestedProp.key.name),
                                j.memberExpression(
                                    j.identifier(prop.key.name),
                                    j.identifier(nestedProp.key.name)
                                )
                            )]
                        );
                        resultNodes.push(varDeclaration);
                    });
                }
            });
            
            // Return all the nodes together
            return resultNodes;
        })
        .toSource({ 
            quote: 'single',
            trailingComma: false,
            useTabs: false,
            wrapColumn: 120
        });
}

export default transformer;
