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

    // Map: importPath -> { defaultImportName, importPath, importDeclPath, importedNames: Set }
    const importMap = new Map();

    // First pass: handle imports, collect destructured names
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

            // Check if a default import for this module already exists
            const existingDefaultImport = root.find(j.ImportDeclaration, {
                source: { value: importPath }
            }).nodes().find(decl =>
                decl.specifiers.some(s => s.type === "ImportDefaultSpecifier")
            );

            let defaultImportName, importDeclPath;
            if (existingDefaultImport) {
                defaultImportName = existingDefaultImport.specifiers.find(
                    s => s.type === "ImportDefaultSpecifier"
                ).local.name;
                // Remove the current import (will destructure from the existing default import)
                j(path).remove();
                // Find the path of the existing default import
                importDeclPath = root.find(j.ImportDeclaration, {
                    source: { value: importPath }
                }).at(0).get();
            } else {
                // Generate a unique variable name for the default import
                let baseName = importPath
                    .split("/")
                    .pop()
                    .replace(/\.js$/, "")
                    .replace(/[^a-zA-Z0-9_$]/g, "");
                if (!baseName) baseName = "mod";
                defaultImportName = baseName;
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
                importDeclPath = path;
            }

            // Collect imported names for this importPath
            if (!importMap.has(importPath)) {
                importMap.set(importPath, {
                    defaultImportName,
                    importPath,
                    importDeclPath,
                    importedNames: new Map()
                });
            }
            const entry = importMap.get(importPath);
            for (const { imported, local } of importedNames) {
                entry.importedNames.set(local, imported);
            }
        });

    // Remove all destructuring statements for these default import variables
    for (const { defaultImportName } of importMap.values()) {
        root.find(j.VariableDeclaration)
            .filter(path => {
                const decl = path.node.declarations[0];
                return (
                    decl &&
                    decl.id &&
                    decl.id.type === "ObjectPattern" &&
                    decl.init &&
                    decl.init.type === "Identifier" &&
                    decl.init.name === defaultImportName
                );
            })
            .remove();
    }

    // Insert merged destructuring after the import
    for (const { defaultImportName, importDeclPath, importedNames } of importMap.values()) {
        if (importedNames.size === 0) continue;
        const properties = Array.from(importedNames.entries()).map(([local, imported]) =>
            j.property(
                "init",
                j.identifier(imported),
                j.identifier(local)
            )
        );
        const destructure = j.variableDeclaration("const", [
            j.variableDeclarator(
                j.objectPattern(properties),
                j.identifier(defaultImportName)
            )
        ]);
        j(importDeclPath).insertAfter(destructure);
    }

    return root.toSource();
}; 