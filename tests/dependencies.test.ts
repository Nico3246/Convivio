import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

const commonjs = createRequire(import.meta.url);
const queryString = commonjs('query-string') as {
  parse: (input: string) => Record<string, unknown>;
  stringify: (input: Record<string, string>) => string;
};

test('el decodificador corregido conserva las exportaciones que utiliza Expo Router', () => {
  const input = { code: 'abc+xyz', nombre: 'María', piso: '🏠' };
  expect(queryString.parse(queryString.stringify(input))).toEqual(input);
});

test('el parser admite secuencias porcentuales malformadas sin recursión exponencial', () => {
  const malformed = '%FF'.repeat(1000);
  expect(queryString.parse(`valor=${malformed}`).valor).toBe(malformed);
  expect(queryString.parse('nombre=%C3%B1%FF').nombre).toBe('ñ%FF');
});

test('xcode sigue generando sus identificadores con la versión corregida de uuid', () => {
  const xcode = commonjs('xcode') as {
    project: (path: string) => {
      hash: { project: { objects: Record<string, unknown> } };
      generateUuid: () => string;
    };
  };
  const project = xcode.project('Convivio.xcodeproj/project.pbxproj');
  project.hash = { project: { objects: {} } };
  expect(project.generateUuid()).toMatch(/^[A-F0-9]{24}$/);
});
