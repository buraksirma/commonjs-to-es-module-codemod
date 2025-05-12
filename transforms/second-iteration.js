import removeAccessOverModuleExports from "./remove-access-over-module-exports";
import removeAnonymousFunctionVars from "./remove-anonymous-function-vars";
import useNamespaceImportIfNoDefault from "./use-namespace-import-if-no-default";
import destructuredImportToDefaultImport from "./destructured-import-to-default-import";

const transformScripts = (fileInfo, api, options) => {
    return [
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
