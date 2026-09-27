# Adaptación CommonJS de decode-uri-component

Origen: decode-uri-component 0.5.0 (npm), licencia MIT conservada en LICENSE.

SHA-256 del index.js original: `9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa`.

Solo se sustituye `export default function decodeUriComponent` por `module.exports = function decodeUriComponent`. El algoritmo es el publicado en 0.5.0; no se modifica. El archivo no pasa por el formateador para facilitar su comparación.

Expo Router 57.0.23 utiliza query-string 7.1.3, que requiere una función CommonJS. La versión corregida 0.5.0 del decodificador solo publica ESM. Esta adaptación permite aplicar la corrección GHSA-vcc3-ghjq-m6fr sin cambiar las exportaciones de query-string ni instalar otra versión de Expo.

Revisar y retirar este override cuando Expo Router incorpore dependencias compatibles corregidas. No actualizar este código sin comparar el origen y ejecutar la prueba de interoperabilidad y el bundle Android.

Fuentes:

- https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0
- https://github.com/advisories/GHSA-vcc3-ghjq-m6fr
