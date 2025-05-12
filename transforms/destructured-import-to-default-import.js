const path = require("path");
const fs = require("fs");

function hasDefaultExport(importPath, currentFilePath) {
    // Try to resolve the import path to an actual file
    let resolvedPath = importPath;
    if (!importPath.endsWith(".js")) {
        resolvedPath += ".js";
    }
    // Handle relative paths
    if (importPath.startsWith(".")) {
        resolvedPath = path.resolve(path.dirname(currentFilePath), resolvedPath);
    }
    if (!fs.existsSync(resolvedPath)) return false;

    const fileContent = fs.readFileSync(resolvedPath, "utf8");
    // Naive check for "export default"
    return /export\s+default\s+/.test(fileContent);
}

module.exports = function destructuredImportToDefaultImport(fileInfo, api, options) {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);

    root.find(j.ImportDeclaration)
        .filter(path => {
            // Only destructured imports (named imports)
            return (
                path.node.specifiers.some(
                    s => s.type === "ImportSpecifier"
                ) &&
                !path.node.specifiers.some(
                    s => s.type === "ImportDefaultSpecifier"
                )
            );
        })
        .forEach(path => {
            const importPath = path.node.source.value;
            if (!hasDefaultExport(importPath, fileInfo.path)) return;

            // Get all imported names
            const importedNames = path.node.specifiers
                .filter(s => s.type === "ImportSpecifier")
                .map(s => ({
                    imported: s.imported.name,
                    local: s.local.name
                }));

            // Generate a unique variable name for the default import
            let baseName = path.node.source.value
                .split("/")
                .pop()
                .replace(/\.js$/, "")
                .replace(/[^a-zA-Z0-9_$]/g, "");
            if (!baseName) baseName = "mod";
            let defaultImportName = baseName;
            let i = 1;
            while (
                root.find(j.Identifier, { name: defaultImportName }).size() > 0
            ) {
                defaultImportName = baseName + i;
                i++;
            }

            // Replace import with default import
            path.node.specifiers = [
                j.importDefaultSpecifier(j.identifier(defaultImportName))
            ];

            // Insert destructuring after the import
            const destructure = j.variableDeclaration("const", [
                j.variableDeclarator(
                    j.objectPattern(
                        importedNames.map(({ imported, local }) =>
                            j.property(
                                "init",
                                j.identifier(imported),
                                j.identifier(local)
                            )
                        )
                    ),
                    j.identifier(defaultImportName)
                )
            ]);
            // Insert after the import
            j(path).insertAfter(destructure);
        });

    return root.toSource();
}; 