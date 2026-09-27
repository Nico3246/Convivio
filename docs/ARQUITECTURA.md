# Arquitectura de Convivio 0.2.0

## Límites de esta entrega

La versión 0.2.0 contiene pantallas y operaciones conectadas para los módulos de Convivio. Se ha exportado el bundle Android, pero no se ha generado ni instalado una APK ni desplegado los servicios.

Las pruebas ejecutan las migraciones completas en PostgreSQL embebido (PGlite), incluso con grants iniciales permisivos como los que pueden existir en Supabase. Auth, Storage, llamadas externas y componentes nativos se simulan en las pruebas correspondientes. Los formularios se prueban con React y servicios controlados; falta la validación física Android descrita en `PUESTA_EN_MARCHA.md`.

## Responsabilidades

| Capa                | Responsabilidad                                                                  |
| ------------------- | -------------------------------------------------------------------------------- |
| App Android         | Formularios, validación inmediata y presentación; no decide permisos reales      |
| Servicios de la app | OAuth con PKCE, acceso tipado y comprobación de respuestas                       |
| PostgreSQL          | Roles, pertenencia, privacidad, versiones, transacciones y cálculos de dinero    |
| RLS + privilegios   | Lecturas por propietario y rol; denegación de escrituras directas sensibles      |
| Funciones SQL       | Mutaciones explícitas, autor del servidor, serialización por piso e idempotencia |
| Edge Functions      | Identidad verificada, admisión, limpieza Auth/Storage y entrega push             |
| Cron                | Mantenimiento, tareas e informes en Europe/Madrid, sin horario UTC fijo          |

## Relaciones y eliminación

Todas las entidades de dominio llevan household_id. Las referencias compuestas impiden relacionar miembros, normas o deudas de pisos diferentes. Solo existe una plaza por rol; un trigger impide cambiar la identidad, piso o rol de una cuenta.

La relación con un usuario (autor, responsable, pagador, deudor, aprobador, propietario) usa claves externas con borrado en cascada. En el caso de normas aprobadas por un controlador que se da de baja, se elimina la norma completa para evitar que una versión antigua se reactive silenciosamente.

La baja del administrador elimina el hogar y sus tres pertenencias. El borrado de las identidades de **Convivio Auth** no elimina las cuentas de Google de esas personas.

Las imágenes no se eliminan mediante DELETE de storage.objects, que solo borraría metadatos: se usa la API de Storage. Una cola privada y reintentable sobrevive al borrado del piso hasta confirmar la eliminación física. Conserva únicamente los identificadores y rutas necesarios mientras se completa esa operación; al completarse, se elimina también el trabajo.

No se guardan copias propias de seguridad, contenido personal en logs ni instantáneas JSON opacas de informes. Los informes contienen referencias estructuradas: al borrar una falta se sustituyen por una anotación de eliminación; al dar de baja a una persona desaparecen los registros relacionados.

## Dinero

Los importes se almacenan como enteros en céntimos; el límite de entrada es 10.000.000 €. Un gasto compartido entre los dos residentes genera deuda ceil(total/2), por lo que el deudor asume el céntimo impar. Las deudas manuales usan el importe íntegro. Si solo participa el pagador, el gasto no genera deuda; si solo participa el otro residente, debe el importe completo.

Los movimientos tienen cabecera y versiones. Una corrección conserva la versión original, requiere motivo y versión esperada, y cambia qué versión participa en el saldo. Un pago puede corregirse a cero o reasignarse a la deuda correcta. Cambiar el pagador de un gasto con pagos requiere corregir antes esos pagos para no reinterpretar una transferencia.

Las operaciones económicas toman un bloqueo del piso, adecuado a tres usuarios; evita lecturas concurrentes que permitirían sobrepagos. Las claves de petición hacen que un reintento idéntico devuelva el mismo resultado y que una reutilización con datos distintos falle.

La vista debt_balances es security_invoker: respeta RLS. La función `money_summary` agrega todo el historial visible, con independencia de la paginación de pantalla. El balance neto resulta de sumar importes pendientes de los que el residente es acreedor y restar aquellos en los que es deudor. Se conservan los movimientos originales.

## Informes

Se cierran el sábado a las 12:00 de Madrid. La semana se resta en hora local, por lo que alrededor del cambio de hora puede durar 167 o 169 horas. Se emplean límites [inicio, fin). Las novedades se seleccionan por fecha de registro en el servidor, no por una fecha de suceso modificable por el cliente.

Cada periodo es único. El proceso puede recuperar periodos pendientes tras una interrupción. Las tareas pendientes se incluyen como contexto, aunque hayan aparecido en un informe previo; las novedades de faltas, quejas, comentarios y movimientos se asignan a su periodo de registro.

El controlador puede consultar la cabecera del informe y sus entradas de convivencia; no puede consultar entradas económicas ni domésticas. No se guarda un resumen económico en una cabecera accesible al controlador. Las entradas de compras personales comprueban además que el producto relacionado sea visible para el propietario.

El saldo al cierre usa la última versión de cada movimiento registrada antes del fin del informe. Los turnos de ducha conservan revisiones estructuradas y referencias a los usuarios; una modificación posterior no reescribe el turno informado. Las claves externas aplican las bajas a estas revisiones y entradas.

## App y contratos

La navegación comprueba el rol antes de montar cada pantalla. PostgreSQL vuelve a comprobar permisos independientemente del cliente. El administrador no recibe permisos implícitos sobre información personal del otro residente.

Los tipos se generan con `npm run types:db` a partir de las mismas migraciones de las pruebas. `api.ts` centraliza RPCs, consultas paginadas, errores y selección de columnas públicas de miembros. Las cantidades monetarias se analizan como céntimos enteros; no se guarda el resultado de un cálculo flotante.

Las consultas usan claves que incluyen la identidad, se refrescan al recuperar el foco y se descartan al cambiar de cuenta. No se persiste la caché de datos. Los formularios conservan su borrador y revisión inicial frente a refrescos; el servidor exige esa revisión para corregir registros. No hay una cola de escrituras offline.

`useCommand` evita envíos simultáneos y conserva la clave de un reintento con los mismos datos mientras el formulario permanece montado. Tras una confirmación, la siguiente acción recibe una clave nueva, aunque repita el contenido. Un error de conexión indica que el resultado no se ha confirmado. Si se cierra el formulario o la app después de un error, hay que consultar el historial antes de crear otra operación: no se promete deduplicación de formularios nuevos tras reiniciar.

## Fotos y notificaciones

La cámara/galería genera una copia JPEG comprimida de hasta 1 MB; el archivo temporal se retira al cambiar o salir del formulario. La subida requiere una reserva autorizada y limitada en el tiempo. El objeto no admite sobrescritura; la confirmación comprueba su existencia en Storage.

La lectura usa una descarga autenticada y una imagen en memoria, sin enlaces públicos ni URLs firmadas duraderas. Al pasar a segundo plano se retira la imagen mostrada. La eliminación revoca el acceso lógico inmediatamente; la cola espera a que caduquen las posibles subidas en curso y un barrido detecta objetos sin referencia.

El servidor envía exclusivamente avisos de informe semanal y excepciones. La carga push no contiene nombres, fotografías, acusaciones ni importes. El aviso semanal dice «Resumen semanal disponible». Un ticket queda pendiente hasta recibir su recibo de Expo; los dispositivos inválidos se desregistran y los fallos temporales se reintentan. El presupuesto de peticiones del trabajador se limita a 45 segundos; una reserva sin confirmar caduca y vuelve a intentarse. La entrega push no es una garantía de lectura por la persona.

## Control operativo

- Las funciones de mantenimiento y admisión solo admiten service_role. La migración 016 elimina tanto los grants de PUBLIC como los grants explícitos por defecto a anon/authenticated, y restaura una lista cerrada de operaciones por rol.
- El proyecto de Supabase es dedicado. Todas las migraciones se aplican con el mismo propietario; se ejecuta `scripts/verify-permissions.sql` antes de bootstrap y de habilitar la app.
- Las Edge Functions comprueban la identidad o el secreto del planificador por sí mismas; verify_jwt=false no significa acceso sin autorización.
- Los secretos privilegiados nunca tienen prefijo EXPO_PUBLIC ni entran en la APK.
- La cola utiliza reservas con caducidad y confirmación por token; un trabajador antiguo no puede confirmar una reserva nueva.
- Hay que observar cron.job_run_details, fallos de invocación y antigüedad de private.cleanup_queue. Ninguno de estos logs debe contener pruebas, tickets o descripciones.
- No se promete eliminación de copias que un usuario ya haya descargado en su propio dispositivo ni disponibilidad garantizada por el plan gratuito.

## Dependencias indirectas corregidas

La instalación fija `uuid` 11.1.1 bajo `xcode` para aplicar GHSA-w5hq-g745-h8pq conservando CommonJS. El uso real de `uuid.v4()` desde `xcode` se comprueba en las pruebas.

`query-string` 7.1.3, usado por Expo Router, requiere el decodificador como función CommonJS. El parche oficial de `decode-uri-component` 0.5.0 corrige GHSA-vcc3-ghjq-m6fr, pero se distribuye solo como ESM. `vendor/decode-uri-component` conserva ese algoritmo y su licencia MIT, adaptando únicamente la declaración de exportación. Su procedencia y hash están documentados junto al archivo. Se debe retirar la adaptación cuando Expo Router incorpore una dependencia compatible corregida. Las pruebas comprueban la interoperabilidad, los caracteres Unicode y las entradas malformadas.

## Referencias oficiales revisadas

- https://expo.dev/changelog/sdk-57
- https://docs.expo.dev/guides/using-supabase/
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/backups
- https://github.com/advisories/GHSA-vcc3-ghjq-m6fr
- https://github.com/advisories/GHSA-w5hq-g745-h8pq

- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/api/securing-your-api
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://docs.expo.dev/push-notifications/fcm-credentials/
