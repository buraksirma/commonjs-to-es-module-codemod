import toImportDefault from "./require-to-import-default";
import toNamedImport from "./require-with-props-to-named-import";
import toExportDefault from "./module-exports-to-export-default";
import toNamedExport from "./module-exports-to-named-export";
import singleRequire from "./single-require";
import nestedImportFlatImport from "./nested-import-flat-import";
import fixImportPaths from "./fix-import-paths";
import removeAccessOverModuleExports from "./remove-access-over-module-exports";
import removeAnonymousFunctionVars from "./remove-anonymous-function-vars";
import useNamespaceImportIfNoDefault from "./use-namespace-import-if-no-default";
import destructuredImportToDefaultImport from "./destructured-import-to-default-import";

const transformScripts = (fileInfo, api, options) => {
    return [
        nestedImportFlatImport, 
        toExportDefault, 
        toNamedImport, 
        singleRequire, 
        toImportDefault, 
        toNamedExport,
        fixImportPaths,
        useNamespaceImportIfNoDefault,
        destructuredImportToDefaultImport,
        removeAccessOverModuleExports,
        removeAnonymousFunctionVars,
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
