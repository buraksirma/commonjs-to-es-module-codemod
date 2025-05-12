import toImportDefault from "./require-to-import-default";
import toNamedImport from "./require-with-props-to-named-import";
import toExportDefault from "./module-exports-to-export-default";
import toNamedExport from "./module-exports-to-named-export";
import singleRequire from "./single-require";
import nestedImportFlatImport from "./nested-import-flat-import";
import fixImportPaths from "./fix-import-paths";
import defineDirnameFilename from './define-dirname-filename';
import requireDotenvConfigToImport from "./require-dotenv-config-to-import";

const transformScripts = (fileInfo, api, options) => {
    return [
        requireDotenvConfigToImport,
        nestedImportFlatImport, 
        toExportDefault, 
        toNamedImport, 
        singleRequire, 
        toImportDefault, 
        toNamedExport,
        defineDirnameFilename,
        fixImportPaths,
    ].reduce((input, script) => {
        return script(
            {
                source: input,
                path: fileInfo.path
            },
            api,
            options
        );
    }, fileInfo.source);
};

module.exports = transformScripts;
