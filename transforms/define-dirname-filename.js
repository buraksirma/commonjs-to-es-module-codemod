/**
 * Replace __dirname and __filename with import.meta.dirname and import.meta.filename for ESM compatibility.
 */
function transformer(file, api, options) {
    const j = api.jscodeshift;
    let root = j(file.source);

    // Replace __dirname
    root = root.find(j.Identifier, { name: '__dirname' })
        .replaceWith(() =>
            j.memberExpression(
                j.metaProperty(
                    j.identifier('import'),
                    j.identifier('meta')
                ),
                j.identifier('dirname')
            )
        );

    // Replace __filename
    root = root.find(j.Identifier, { name: '__filename' })
        .replaceWith(() =>
            j.memberExpression(
                j.metaProperty(
                    j.identifier('import'),
                    j.identifier('meta')
                ),
                j.identifier('filename')
            )
        );

    return root.toSource({ quote: 'single' });
}

export default transformer; 