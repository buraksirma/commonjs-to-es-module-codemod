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

    // Only handle ESM imports
    root.find(j.ImportDeclaration)
        .forEach(pathNode => {
            const node = pathNode.node;
            // Only default imports (no named, no namespace)
            if (
                node.specifiers.length === 1 &&
                node.specifiers[0].type === "ImportDefaultSpecifier"
            ) {
                const importPath = node.source.value;
                // Only handle relative imports
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

                    if (!hasDefault && hasNamed) {
                        // Replace with namespace import
                        node.specifiers = [
                            j.importNamespaceSpecifier(node.specifiers[0].local)
                        ];
                    }
                }
            }
        });

    return root.toSource();
}; 