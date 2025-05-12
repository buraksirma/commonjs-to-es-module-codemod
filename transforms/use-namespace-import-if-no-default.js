const fs = require("fs");
const path = require("path");

/**
 * Checks if a file has a default export and/or named exports.
 * Returns { hasDefault: boolean, hasNamed: boolean }
 */
function getExportInfo(filePath) {
    if (!fs.existsSync(filePath)) return { hasDefault: false, hasNamed: false };

    const code = fs.readFileSync(filePath, "utf8");
    // Simple regexes for ESM exports
    const hasDefault = /export\s+default\s+/.test(code);
    const hasNamed = /export\s+(const|function|class|let|var|async|{)/.test(code);

    return { hasDefault, hasNamed };
}

module.exports = function useNamespaceImportIfNoDefault(fileInfo, api, options) {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);

    root.find(j.ImportDeclaration)
        .forEach(pathNode => {
            const node = pathNode.node;
            // Only handle relative imports
            const importPath = node.source.value;
            if (
                importPath.startsWith(".") &&
                (importPath.endsWith(".js") || importPath.endsWith(".mjs") || importPath.endsWith(".cjs"))
            ) {
                // Resolve the imported file path
                const currentDir = path.dirname(fileInfo.path);
                let resolvedPath = path.resolve(currentDir, importPath);

                // Try with/without extension
                if (!fs.existsSync(resolvedPath)) {
                    if (fs.existsSync(resolvedPath + ".js")) {
                        resolvedPath += ".js";
                    } else if (fs.existsSync(resolvedPath + ".mjs")) {
                        resolvedPath += ".mjs";
                    } else if (fs.existsSync(resolvedPath + ".cjs")) {
                        resolvedPath += ".cjs";
                    } else if (fs.existsSync(path.join(resolvedPath, "index.js"))) {
                        resolvedPath = path.join(resolvedPath, "index.js");
                    } else {
                        // File not found, skip
                        return;
                    }
                }

                const { hasDefault, hasNamed } = getExportInfo(resolvedPath);

                // --- handle default + named import ---
                const defaultSpecifier = node.specifiers.find(s => s.type === "ImportDefaultSpecifier");
                const namedSpecifiers = node.specifiers.filter(s => s.type === "ImportSpecifier");

                if (!hasDefault && hasNamed && defaultSpecifier && namedSpecifiers.length > 0) {
                    // 1. Replace with namespace import
                    node.specifiers = [
                        j.importNamespaceSpecifier(defaultSpecifier.local)
                    ];

                    // 2. Insert destructuring after the import
                    const destructureNames = namedSpecifiers.map(s => s.imported.name);
                    const destructureStatement = j.variableDeclaration(
                        "const",
                        [
                            j.variableDeclarator(
                                j.objectPattern(
                                    namedSpecifiers.map(s =>
                                        j.property(
                                            "init",
                                            j.identifier(s.imported.name),
                                            j.identifier(s.local.name)
                                        )
                                    )
                                ),
                                j.identifier(defaultSpecifier.local.name)
                            )
                        ]
                    );

                    // Insert after this import
                    j(pathNode).insertAfter(destructureStatement);
                }
                // --- handle default + named import ---

                // --- only default import, no named, no namespace ---
                else if (!hasDefault && hasNamed && node.specifiers.length === 1 && defaultSpecifier) {
                    node.specifiers = [
                        j.importNamespaceSpecifier(defaultSpecifier.local)
                    ];
                }
            }
        });

    return root.toSource();
}; 