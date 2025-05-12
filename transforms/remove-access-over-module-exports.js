/**
 * Transform
 *
 *   module.exports.foo(...)
 *   module.exports.bar
 *
 * to
 *
 *   foo(...)
 *   bar
 *
 * Only on global context
 */

import Logger from "./utils/logger";
import { isTopNode } from "./utils/filters";

function transformer(file, api, options) {
    const j = api.jscodeshift;
    const logger = new Logger(file, options);

    // Find all MemberExpressions of the form module.exports.<something>
    const nodes = j(file.source)
        .find(j.MemberExpression, {
            object: {
                type: "MemberExpression",
                object: { name: "module" },
                property: { name: "exports" }
            }
        })

    logger.log(`${nodes.length} module.exports.<prop> accesses will be transformed`);

    // Replace module.exports.foo with just foo
    return nodes
        .replaceWith(path => {
            // module.exports.foo --> foo
            return j.identifier(path.node.property.name);
        })
        .toSource({ quote: "single" });
}

export default transformer;
