# Convivio · 0.2.0

Aplicación Android privada para dos residentes y un controlador. Esta entrega incorpora las interfaces aprobadas y las conecta a las operaciones del servidor.

## Incluido

- Acceso con Google y PKCE, sesión en almacenamiento seguro y navegación según el rol inmutable.
- Normas y propuestas con aprobación del controlador; faltas, pruebas, comentarios, filtros y estadísticas; quejas y excepciones con dos aprobaciones.
- Calendario, tareas periódicas, rotación, turnos de ducha, edición e intercambio.
- Inventarios y listas personales, compartidas y del hogar; cantidades y compra con incorporación opcional al inventario.
- Gastos de uno o dos participantes, céntimos exactos, deudas, pagos parciales, liquidación y correcciones con historial.
- Informes semanales, saldos al cierre, turnos versionados y referencias que respetan el borrado definitivo.
- Administración, autorización de cuentas nuevas, bajas, eliminación del piso, auditoría, temas y bandeja de notificaciones.
- Selección y compresión de imágenes, subida privada, notificaciones Expo/FCM y procesos reintentables de limpieza.
- Dieciséis migraciones SQL, permisos explícitos, tipos generados, pruebas y configuración de CI.

**El código todavía requiere conectar los servicios y validarlo en un móvil.** No se ha generado una APK ni desplegado Supabase. Las pruebas locales de formularios y PostgreSQL no sustituyen la prueba de Google, cámara, Storage y notificaciones reales.

## Ejecutar las comprobaciones

Con Node.js 24 y la carpeta descomprimida:

```sh
npm ci
npm run verify
npm run format:check
npm run build:check
```

`verify` comprueba tipos, lint y pruebas. `build:check` exporta JavaScript/Hermes y recursos Android; no compila una APK. Si la consulta de metadatos de Expo no está disponible, se puede exportar con `EXPO_OFFLINE=1`. Esto no habilita escrituras sin conexión en Convivio.

No hace falta Docker para estas pruebas: PGlite ejecuta las migraciones SQL. Auth, Storage y componentes nativos se sustituyen en las pruebas por entornos controlados; sus servicios reales están pendientes de validar.

Después de cambiar una migración:

```sh
npm run types:db
npm run verify
```

El archivo generado `src/services/database.types.ts` no se modifica manualmente.

## Preparar la prueba en Android

Sigue [la guía de puesta en marcha](docs/PUESTA_EN_MARCHA.md). Requiere un proyecto Supabase dedicado, Google OAuth, configuración de notificaciones y un development build de Android.

La configuración incluida utiliza estos nombres:

| Variable                               | Dónde se utiliza                                               |
| -------------------------------------- | -------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | App: URL del proyecto                                          |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | App: clave pública                                             |
| `EXPO_PUBLIC_ENVIRONMENT`              | App: `development` o `production`                              |
| `EXPO_PUBLIC_EAS_PROJECT_ID`           | App: proyecto de Expo para push                                |
| `GOOGLE_SERVICES_JSON`                 | Compilación: ruta al archivo de configuración Firebase Android |
| `CONVIVIO_WORKER_SECRET`               | Solo servidor y Vault                                          |
| `EXPO_ACCESS_TOKEN`                    | Solo servidor, cuando se protege el servicio push de Expo      |

El identificador Android de desarrollo es `app.convivio.mobile.dev`; el de producción, `app.convivio.mobile`. La cuenta de servicio FCM se configura en EAS, no en la app ni en este repositorio.

## Estado de validación

Los resultados y límites están en [VALIDACION.md](docs/VALIDACION.md). Las pruebas críticas cubren permisos de cada rol, registros personales, correcciones, reportes, borrados, concurrencia, reintentos y formularios aprobados.

No se ha publicado en GitHub, creado una cuenta cloud ni contratado servicios. La CI está preparada para ejecutarse al subir el proyecto a un repositorio.

El objetivo sigue siendo 0 €/mes dentro de las cuotas gratuitas, sin copias propias de datos. No actives servicios de pago para completar la instalación. El proyecto mantiene la adaptación de dependencia de `vendor/decode-uri-component`, necesaria para `npm ci` y documentada en esa carpeta.

Los requisitos originales se conservan sin cambios en `docs/originales`. Las aclaraciones y aprobaciones de [DECISIONES.md](docs/DECISIONES.md) tienen precedencia.
