# Puesta en marcha de Convivio 0.2.0

Esta guía prepara un entorno de desarrollo con datos de prueba. No hay servicios configurados ni credenciales incluidas. Los pasos que requieren tu cuenta se realizan en los paneles de los proveedores.

## 1. Código y herramientas

Descomprime el proyecto, abre su carpeta en VS Code e instala Node.js 24, Git y Android Studio con el SDK de Android. En una terminal de esa carpeta:

```sh
npm ci
npm run verify
```

Para modificar código, empieza por `src/features`, separado por módulos. `app` contiene navegación y acceso, `src/services` el acceso a datos y `supabase` la lógica y permisos del servidor. Los tipos de TypeScript comprueban los contratos; las operaciones SQL deciden los permisos reales.

## 2. Supabase

Crea un proyecto dedicado de desarrollo con el plan gratuito. Guarda las claves privilegiadas en tu gestor de contraseñas y en las variables del servidor.

Con Supabase CLI instalado y vinculado al proyecto, aplica **las dieciséis migraciones completas, en orden**, antes de autorizar usuarios. Las últimas migraciones cierran también permisos que algunos proyectos conceden explícitamente por defecto.

```sh
supabase db push
supabase functions deploy claim-membership
supabase functions deploy maintenance
```

Ejecuta `scripts/verify-permissions.sql` en el editor SQL y comprueba que termina sin errores. No habilites la aplicación si falla esta comprobación. Mantén `private` fuera de los esquemas expuestos por la API.

La actualización desde una base 0.1.0 conserva sus migraciones originales y aplica las posteriores. No vuelvas a ejecutar `bootstrap` en un piso ya creado.

## 3. Google y las tres cuentas

Configura un cliente OAuth web de Google y el proveedor Google de Supabase. Copia exactamente la URL de callback HTTPS que muestra Supabase al configurar el cliente de Google. En las redirecciones autorizadas de Supabase incluye `convivio://auth/callback`.

Si la pantalla de consentimiento de Google está en modo de pruebas, autoriza los correos que vayas a utilizar. Copia `scripts/bootstrap.sql` fuera del repositorio, introduce los tres correos reales y ejecútalo una única vez. Sus marcadores de ejemplo no son usuarios válidos.

El acceso Google identifica a la persona; la función de admisión verifica en el servidor que ese correo tiene una plaza autorizada. Solo después crea la pertenencia con el rol establecido.

## 4. Mantenimiento

Configura `CONVIVIO_WORKER_SECRET` en las Edge Functions. Guarda el mismo valor en Vault con el nombre `convivio_worker_secret`, y la URL del proyecto en `convivio_project_url`. No pongas estos valores en variables `EXPO_PUBLIC_*`.

Ejecuta `scripts/configure-maintenance.sql`. Comprueba una invocación autorizada del trabajador y su resultado. Cron lo llama cada minuto; el servidor determina cuándo corresponde generar cada informe, con la hora de Madrid.

Revisa invocaciones fallidas, `cron.job_run_details`, antigüedad de `private.cleanup_queue` y reintentos de `private.push_deliveries`. Una baja revoca primero el acceso; el borrado físico de archivos y Auth puede permanecer pendiente hasta que el trabajador lo confirme.

## 5. Notificaciones Android

Vincula el proyecto de Expo/EAS y utiliza su UUID en `EXPO_PUBLIC_EAS_PROJECT_ID`. Configura Firebase para el identificador Android del entorno que compiles.

El archivo **google-services.json** es la configuración cliente de Firebase. Indica su ruta mediante `GOOGLE_SERVICES_JSON`; en EAS puede ser una variable de tipo archivo. La **clave privada de cuenta de servicio FCM** es otro archivo: se configura en las credenciales FCM V1 de EAS. Guárdala fuera del repositorio.

Si activas la protección adicional del servicio push de Expo, define `EXPO_ACCESS_TOKEN` en el servidor. La app permite activar los avisos desde Perfil, en un móvil real. Un ticket de Expo queda pendiente hasta consultar su recibo; la bandeja de Convivio conserva el aviso si el teléfono no recibe el push.

## 6. Ejecutar en tu móvil

Copia `.env.example` a `.env` y rellena las variables públicas y la ruta de Firebase. Activa depuración USB en Android y conecta el móvil:

```sh
npm run android
```

Después puedes iniciar el servidor de desarrollo con `npm start`. Utiliza una compilación de desarrollo de Convivio para probar OAuth, permisos nativos y notificaciones.

También está preparado `eas.json` para compilar con EAS cuando tu cuenta tenga cuota gratuita disponible. Para mantener coste cero, puedes usar Android Studio localmente y evitar contratar ampliaciones. No se incluye publicación en Google Play.

## 7. Comprobación antes del uso real

Con cuentas de prueba, verifica:

1. Entrada, cancelación de Google, enlace con la app cerrada, cambio de cuenta y sesión revocada.
2. Cada rol y los enlaces directos. El controlador no debe obtener compras, tareas, recibos ni saldos; el administrador no debe obtener productos personales del otro residente.
3. Gasto de 10,01 €, ambos participantes, un participante, pago parcial, corrección, versión original e intento simultáneo desde dos móviles.
4. Excepción con dos aprobaciones y rechazo definitivo; propuesta de norma, aprobación y conflicto de versión.
5. Foto con cámara/galería, caída de red durante subida, reintento y eliminación definitiva de la falta.
6. Informe, fechas del hecho y del registro, corrección posterior y retirada de datos borrados.
7. Baja de una cuenta, eliminación real en Auth/Storage y recuperación de un fallo del trabajador. Prueba la baja del administrador únicamente en el piso de pruebas.
8. Lectura con TalkBack, letra grande, teclado, temas y notificaciones con la app abierta, en segundo plano y cerrada.

No se marca esta validación como completada hasta realizarla en Android y Supabase reales.

## Referencias oficiales

- [Google OAuth con Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).
- [Permisos de funciones](https://supabase.com/docs/guides/database/functions) y [protección de la API](https://supabase.com/docs/guides/api/securing-your-api).
- [Credenciales Android FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/).
- [Compilaciones de desarrollo Expo](https://docs.expo.dev/develop/development-builds/introduction/).
