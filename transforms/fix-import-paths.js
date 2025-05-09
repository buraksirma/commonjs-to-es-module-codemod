/**
 * Transform import statements to ensure proper path handling:
 * - For JS files: add .js suffix if missing
 * - For directories: add /index.js suffix
 * 
 * This should be run after all other import transformations.
 */

import fs from "fs";
import path from "path";
import Logger from "./utils/logger";

function transformer(file, api, options) {
    const j = api.jscodeshift;
    const logger = new Logger(file, options);
    const root = j(file.source);
    const filePath = file.path || '';
    const fileDirectory = path.dirname(filePath);

    logger.log(`Checking import paths in ${filePath}`);

    // Find all import declarations
    const importDeclarations = root.find(j.ImportDeclaration);
    
    logger.log(`Found ${importDeclarations.length} import declarations to check`);

    // Process each import declaration
    importDeclarations.forEach(importPath => {
        const sourcePath = importPath.node.source;
        
        // Only process string literals that are relative paths
        if (sourcePath.type !== 'Literal' || typeof sourcePath.value !== 'string') {
            return;
        }
        
        const sourceValue = sourcePath.value;
        
        // Only fix relative paths (starting with ./ or ../)
        if (!sourceValue.startsWith('./') && !sourceValue.startsWith('../')) {
            return;
        }
        
        // Skip if already has .js or /index.js suffix
        if (sourceValue.endsWith('.js') || sourceValue.endsWith('/index.js')) {
            return;
        }

        try {
            // Resolve the full path to the imported module
            const resolvedPath = path.resolve(fileDirectory, sourceValue);
            
            try {
                // Check if the path exists
                const stat = fs.statSync(resolvedPath);
                
                if (stat.isDirectory()) {
                    // If it's a directory, check if it has an index.js file
                    const indexPath = path.join(resolvedPath, 'index.js');
                    
                    try {
                        const indexStat = fs.statSync(indexPath);
                        
                        if (indexStat.isFile()) {
                            // Add /index.js suffix
                            sourcePath.value = sourceValue + '/index.js';
                            logger.log(`Fixed directory import: ${sourceValue} → ${sourcePath.value}`);
                        }
                    } catch (indexErr) {
                        // If index.js doesn't exist, leave it as is
                    }
                } else if (stat.isFile()) {
                    // It's already a file (without .js extension), don't need to modify
                }
            } catch (err) {
                // Path doesn't exist as is, try adding .js extension
                const jsPath = resolvedPath + '.js';
                
                try {
                    const jsStat = fs.statSync(jsPath);
                    
                    if (jsStat.isFile()) {
                        // Add .js suffix
                        sourcePath.value = sourceValue + '.js';
                        logger.log(`Fixed file import: ${sourceValue} → ${sourcePath.value}`);
                    }
                } catch (jsErr) {
                    // If path with .js doesn't exist either, leave it as is
                }
            }
        } catch (error) {
            logger.warn(`Error fixing import path ${sourceValue}: ${error.message}`);
        }
    });

    return root.toSource();
}

export default transformer; 