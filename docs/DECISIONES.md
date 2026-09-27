# Convivio · decisiones vinculantes

Fecha de consolidación: 24 de septiembre de 2026. Actualización de implementación: 27 de septiembre de 2026.

## Precedencia

1. Aclaraciones expresas del propietario recogidas en este documento.
2. Requisitos y casos de uso originales.
3. Arquitectura tecnológica.
4. Wireframes e identidad visual.

El nombre definitivo es **Convivio**. Las referencias originales a PisoClaro quedan sustituidas por Convivio.

## Identidades y acceso

- Un piso, dos residentes: ADMIN (también residente) y RESIDENT; un tercero CONTROLLER, que nunca es residente.
- Una cuenta ocupa un solo rol. El rol de una cuenta es inmutable.
- Login Google; solo cuentas previamente autorizadas. Autenticarse no otorga pertenencia.
- Inventarios y listas personales: lectura y modificación exclusivas de su propietario, incluso frente al administrador.
- El controlador solo accede a convivencia, nunca a tareas, compras, inventario o dinero.
- Las bajas las gestiona el administrador, de acuerdo con CU-32. La baja de una cuenta no administradora libera su plaza para una cuenta nueva con historial nuevo.
- La baja del administrador **elimina el piso entero**, todas sus pertenencias y todos sus datos.

## Borrados definitivos

- Solo el controlador puede eliminar individualmente una falta. No se usa un estado DISMISSED para conservar su contenido.
- Se eliminan físicamente la falta, fotografías, comentarios y copias del contenido incluidas en informes.
- En auditoría y en el informe anterior se conserva únicamente la constancia de que se eliminó una falta, quién la eliminó y cuándo. No se conserva contenido, fotografía, descripción, persona acusada ni norma original en esa anotación.
- La baja de una cuenta elimina **todo lo relacionado con ella**, incluidos registros compartidos: deudas, pagos, gastos, faltas creadas o recibidas, quejas, normas creadas o aprobadas, decisiones, adjuntos y referencias en informes/auditoría. Los registros dependientes se eliminan en cascada.
- La conservación de historial y auditoría se aplica mientras no concurra una de estas reglas de borrado expresamente aprobadas.
- Si el controlador desaparece y con él una decisión de visita, la solicitud relacionada también se elimina: no se conserva una autorización sin su historial.
- La eliminación del objeto físico de Storage y de la identidad en Auth se completa mediante un proceso reintentable de servidor; los permisos se revocan antes. Una operación pendiente no debe presentarse como completamente finalizada.

## Dinero

- EUR; importes enteros en céntimos. Reparto a partes iguales; el céntimo indivisible lo asume el deudor.
- Ejemplo: gasto 10,01 €, pagador A, participantes A y B: A soporta 5,00 €, B debe 5,01 €.
- Cualquiera de los residentes puede registrar gastos, deudas y pagos.
- Los pagos pueden ser parciales. No hay pagos bancarios integrados.
- Las correcciones conservan el movimiento original y registran su sustitución/anulación, autor, motivo y fecha. Los saldos derivan de movimientos vigentes, sin doble contabilización.
- El balance neto simplifica lo que se debe; no elimina ni fusiona los movimientos originales.

## Informes y convivencia

- Informe cada sábado a las 12:00, zona Europe/Madrid, incluyendo cambios de hora.
- Intervalo técnico semiabierto: [sábado anterior 12:00, sábado actual 12:00).
- Las novedades se incluyen por su fecha de registro en el servidor. Se muestra también la fecha del hecho; los registros tardíos se incluyen en el siguiente informe.
- Los informes guardan referencias y datos estructurados; no se permiten copias opacas de contenido personal que impidan aplicar los borrados.
- Las faltas registradas y mantenidas cuentan en estadísticas; las eliminadas no existen ni cuentan.
- Las quejas no tienen comentarios ni estados de resolución.
- Silencio: noches que empiezan de lunes a viernes, 22:00 a 05:30 del día siguiente; incluye viernes a sábado.
- Visitas: solicitudes que concretan permanecer después de las 21:30, dormir o ambas, con inicio y fin. Otro residente y controlador deben aprobar; un rechazo es definitivo para esa solicitud.
- Tareas: una realización pendiente no retrasa la rotación ni desplaza el calendario siguiente.
- Notificaciones: resumen semanal, solicitud de excepción y resultado final. Nunca avisos inmediatos de faltas, quejas o comentarios.

## Tecnología y calidad

- React Native + Expo SDK 57, TypeScript estricto; Supabase/PostgreSQL, RLS y funciones transaccionales.
- Consultas simples bajo RLS; las mutaciones sensibles se realizan mediante operaciones autorizadas de servidor.
- Android, español, tema claro/oscuro, conexión necesaria. No se promete escritura offline.
- Coste objetivo 0 €/mes dentro de los límites del proveedor; **sin copias de seguridad propias**, por decisión expresa.
- Migraciones versionadas, pruebas de permisos y procesos críticos, CI y claves privilegiadas fuera de la APK.
- Las modificaciones visuales se presentarán para revisión antes de incorporarse a la aplicación.

## Interfaces aprobadas e implementación 0.2.0

- El propietario aprobó las propuestas de interfaz de gasto, excepción de visita, revisión de normas y baja de cuentas antes de su implementación.
- Se mantienen las cinco secciones residenciales y el panel restringido del controlador.
- El selector de participantes del gasto admite al pagador, al otro residente o a ambos; no cambia el criterio de reparto aprobado.
- Las compras personales conservan su privacidad también cuando aparecen como referencias de un informe.
- Los informes económicos seleccionan las versiones registradas antes del cierre; las correcciones posteriores no reemplazan lo informado. Las reglas de borrado definitivo siguen prevaleciendo.
- La edición conserva la revisión inicialmente cargada; el servidor rechaza sobrescribir cambios concurrentes.
