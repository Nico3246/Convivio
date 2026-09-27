# Validación de Convivio 0.2.0

Fecha: 27 de septiembre de 2026. Entorno Linux, Node.js 24.19.0 y npm 11.9.0.

## Comprobaciones realizadas

| Comprobación                                                                    | Resultado                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`                                                   | Instalación limpia completada con el lockfile incluido                                    |
| `npm run typecheck`                                                             | App y funciones de servidor sin errores de tipos                                          |
| `npm run lint`                                                                  | Sin errores ni advertencias de código                                                     |
| `npm test`                                                                      | 97 pruebas aprobadas en 9 archivos                                                        |
| `npm run format:check`                                                          | Formato consistente                                                                       |
| `EXPO_OFFLINE=1 npm run build:check`                                            | Exportación Android completada: 1.605 módulos, bundle Hermes de unos 4,7 MB y 28 recursos |
| `EXPO_OFFLINE=1 npx --no-install expo prebuild --platform android --no-install` | Generación nativa completada en una copia temporal; plugins aplicados sin errores         |
| `npm audit --omit=dev --audit-level=high`                                       | 0 vulnerabilidades notificadas por el registro en esta comprobación                       |

El modo offline de Expo evita la consulta de metadatos remotos durante la exportación; no habilita uso offline de Convivio. La exportación produce JavaScript/Hermes y recursos. Prebuild genera el proyecto Android: se comprobaron el identificador de desarrollo, el enlace `convivio` y `allowBackup=false`. **Ninguno de estos comandos compila, firma ni instala una APK.**

## Cobertura de las pruebas

- Aplicación completa de las dieciséis migraciones sobre PostgreSQL embebido mediante PGlite 0.5.8 y ejecución de la comprobación de permisos de instalación.
- Permisos por rol, aislamiento de pisos, privacidad personal incluso frente al administrador, roles inmutables y bloqueo de escrituras directas.
- Revocación de permisos públicos y de grants explícitos iniciales a `anon`/`authenticated`; funciones de mantenimiento reservadas al servidor.
- Gastos con uno o dos participantes, importes en céntimos, céntimo impar a cargo del deudor, pagos por ambos residentes, sobrepagos y correcciones con conservación del original.
- Saldos agregados independientes de la paginación y versiones económicas correspondientes al cierre de cada informe.
- Dos aprobaciones distintas para visitas, rechazo definitivo, versión de norma aplicable al hecho, propuestas con control de versión y comentarios autorizados.
- Informes por fecha de registro, registros tardíos, privacidad frente al controlador y semanas de 167/169 horas por los cambios de hora de Madrid.
- Eliminación definitiva de faltas y contenido asociado, anotación de borrado en informes, baja con eliminación de registros compartidos, sustitución de una plaza y eliminación del piso al dar de baja al administrador.
- Tareas pendientes sin desplazar la rotación, responsable de realización, turnos de ducha sin solapamiento e historial de sus revisiones.
- Compra con incorporación al inventario en una transacción, separación de productos personales y revisiones de cantidades.
- Reservas de fotos autorizadas, límites, caducidad, confirmación y limpieza que espera a las posibles subidas en curso.
- Registro de dispositivos, cola push, reserva de envíos, tickets, recibos, dispositivos inválidos y reintentos ante errores.
- Admisión basada en la identidad devuelta por Auth, rechazo de tokens denegados, autorización del trabajador y reintento de borrados físicos fallidos.
- PKCE S256 contrastado con el vector de RFC 7636, fechas de Madrid, franjas nocturnas y rutas permitidas por rol.
- Formularios React de gasto, excepción, propuesta de norma y baja: envío de datos, céntimos, participantes, revisión inicial, doble aprobación visible y confirmación de borrado.
- Reintentos de red con la misma clave mientras no se confirma el resultado; dos comentarios iguales ya confirmados usan claves diferentes.
- Interoperabilidad de dependencias corregidas: Unicode, secuencias porcentuales malformadas y generación de identificadores desde xcode.

Las migraciones se ejecutan sin modificar su SQL. El entorno de pruebas crea esquemas mínimos de Auth y Storage y emula permisos iniciales permisivos del proveedor. Las llamadas externas de las Edge Functions usan respuestas simuladas. Las pruebas de formularios montan los componentes reales de React, sustituyendo primitivas nativas y servicios por implementaciones controladas.

Esto permite comprobar permisos, transacciones y comportamiento de los formularios, pero **no constituye una prueba de extremo a extremo de los servicios alojados ni una revisión visual en Android**. Las maquetas HTML anteriores se conservan como referencia; su validación no acredita la interfaz nativa actual.

El análisis de npm informa de avisos conocidos en dependencias de producción. No certifica la ausencia de defectos ni audita el código local adaptado. La adaptación CommonJS del decodificador conserva el algoritmo oficial corregido; origen, hash y cambio de exportación figuran en `vendor/decode-uri-component/PROVENANCE.md`.

## Validaciones pendientes antes de uso real

1. Aplicar las migraciones y desplegar las funciones en un proyecto real de desarrollo; verificar Auth, Storage, Cron y Vault y ejecutar `scripts/verify-permissions.sql`.
2. Probar Google OAuth en Android con las tres cuentas autorizadas, incluyendo cancelación, reanudación, cambio de cuenta y arranque con la app cerrada.
3. Probar dos dispositivos a la vez, pérdidas de conexión, sesiones revocadas y reintentos contra PostgreSQL alojado. Tras cerrar un formulario con un resultado de red desconocido, consultar el historial antes de crear otra operación.
4. Comprobar cámara, galería, compresión, subida, lectura privada y eliminación física de imágenes en Android y Storage reales.
5. Validar Expo/FCM y notificaciones con la app abierta, en segundo plano y cerrada, incluidos recibos e invalidación de dispositivos.
6. Verificar el borrado físico completo en Auth y Storage y la recuperación de fallos del trabajador, además de las cascadas SQL ya probadas.
7. Compilar e instalar una APK de prueba; revisar pantallas, temas, teclado, letra grande y TalkBack en un móvil real.

La preparación está descrita en `PUESTA_EN_MARCHA.md`. No se ha creado un proyecto cloud, publicado en GitHub ni contratado ningún servicio. La integración continua está configurada, pero no existe todavía una ejecución remota de GitHub Actions.
