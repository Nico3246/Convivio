# Convivio · 0.2.0

**Convivio** es una aplicación Android de gestión de convivencia para un piso formado por **dos residentes** y un **controlador externo**. El proyecto centraliza normas, faltas y quejas, tareas, inventarios, gastos e informes semanales, aplicando permisos distintos según el rol de cada usuario.

El código se publica como proyecto personal, aunque la aplicación está diseñada para un entorno de uso privado y controlado.

## Estado actual

Convivio se encuentra en una fase funcional de pruebas reales:

- proyecto Supabase configurado y conectado;
- autenticación con Google integrada mediante Supabase;
- aplicación probada en un dispositivo Android real;
- navegación y acceso según rol comprobados durante las pruebas móviles;
- configuración Android preparada para desarrollo y producción;
- compilaciones mediante Expo Application Services (EAS);
- perfil de producción configurado para generar un **Android App Bundle (AAB)**;
- pruebas automatizadas, comprobaciones de tipos, lint y validaciones de base de datos incluidas en el proyecto.

La aplicación continúa en desarrollo y validación. La existencia de pruebas automatizadas y pruebas reales en Android no implica que todos los escenarios de Auth, Storage, notificaciones, concurrencia o borrado remoto estén certificados de extremo a extremo.

## Roles

Convivio trabaja con tres usuarios y roles fijos:

- **Residente administrador:** vive en el piso y administra su configuración y normas.
- **Residente:** segundo miembro del piso, con acceso a las funciones de convivencia correspondientes.
- **Controlador:** usuario externo que supervisa la información que le corresponde y recibe los informes definidos por el sistema.

Un usuario no puede actuar simultáneamente como residente y controlador.

## Funcionalidades

### Convivencia

- Normas del piso.
- Registro de faltas y pruebas.
- Quejas y comentarios.
- Excepciones y procesos de aprobación.
- Historial de correcciones.
- Calendario semanal.
- Tareas periódicas y rotaciones.
- Turnos de ducha.

### Organización doméstica

- Inventarios personales y compartidos.
- Listas de compra.
- Cantidades y actualización de productos.
- Incorporación de compras al inventario.

### Economía

- Gastos entre residentes.
- Importes almacenados en céntimos.
- Reparto entre uno o dos participantes.
- Cálculo de deudas.
- Pagos parciales y liquidaciones.
- Correcciones conservando el historial.
- Saldos asociados a los cierres de los informes.

### Informes y administración

- Informes semanales.
- Administración de miembros.
- Autorización de nuevas cuentas.
- Baja de usuarios.
- Eliminación del piso cuando se da de baja el administrador.
- Auditoría e historial.
- Bandeja de notificaciones.
- Procesos de limpieza y reintento.

### Multimedia y notificaciones

- Selección de imágenes.
- Compresión antes de la subida.
- Almacenamiento privado.
- Integración con Expo Notifications y FCM.
- Registro de dispositivos y gestión de entregas.

## Tecnologías

- **TypeScript**
- **React Native**
- **Expo 57**
- **Expo Router**
- **Supabase**
- **PostgreSQL**
- **Supabase Auth**
- **Supabase Storage**
- **Google OAuth**
- **TanStack Query**
- **Zod**
- **Vitest**
- **PGlite**
- **Expo Application Services (EAS)**
- **Firebase Cloud Messaging (FCM)**

## Estructura principal

```text
Convivio/
├── app/                 # Navegación y rutas Expo Router
├── assets/              # Recursos gráficos
├── docs/                # Requisitos, decisiones y documentación técnica
├── scripts/             # Utilidades y generación de tipos
├── src/
│   ├── features/        # Funcionalidades organizadas por dominio
│   └── services/        # Acceso a servicios y base de datos
├── supabase/            # Migraciones y funciones de servidor
├── tests/               # Pruebas automatizadas
├── vendor/              # Dependencia adaptada y documentada
├── app.config.ts
├── eas.json
└── package.json
```

## Instalación

Requiere Node.js compatible con la versión indicada en `package.json`.

```bash
git clone https://github.com/Nico3246/Convivio.git
cd Convivio
npm ci
```

Copia el archivo de ejemplo de variables de entorno:

```bash
cp .env.example .env
```

y configura los valores correspondientes a tu entorno.

## Variables de configuración

| Variable | Uso |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública de Supabase |
| `EXPO_PUBLIC_ENVIRONMENT` | Entorno `development` o `production` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Proyecto de Expo/EAS |
| `GOOGLE_SERVICES_JSON` | Ruta al archivo de configuración Firebase para Android |
| `CONVIVIO_WORKER_SECRET` | Secreto exclusivo del servidor/Vault |
| `EXPO_ACCESS_TOKEN` | Token opcional para proteger el servicio push de Expo |

Los secretos del servidor y las credenciales privadas no deben incluirse en variables `EXPO_PUBLIC_*` ni subirse al repositorio.

## Desarrollo en Android

Para ejecutar una compilación de desarrollo en Android:

```bash
npm run android
```

Para iniciar posteriormente el servidor de desarrollo:

```bash
npm start
```

El identificador Android depende del entorno:

- desarrollo: `app.convivio.mobile.dev`;
- producción: `app.convivio.mobile`.

## Compilaciones con EAS

El archivo `eas.json` incluye tres perfiles:

- **development:** APK con development client;
- **preview:** APK de distribución interna;
- **production:** Android App Bundle (AAB).

Ejemplo de compilación de producción:

```bash
npx eas-cli@latest build --platform android --profile production
```

## Comprobaciones del proyecto

```bash
npm run verify
npm run format:check
npm run build:check
```

`verify` ejecuta comprobación de tipos, lint y pruebas.

Las migraciones pueden comprobarse localmente mediante PGlite, por lo que no es necesario disponer de Docker para ejecutar la suite automatizada.

Después de modificar una migración:

```bash
npm run types:db
npm run verify
```

El archivo generado `src/services/database.types.ts` no debe modificarse manualmente.

## Base de datos y seguridad

La lógica de persistencia se apoya en PostgreSQL y Supabase. El proyecto incluye migraciones, funciones de servidor, políticas y comprobaciones específicas para:

- separación entre pisos;
- permisos por rol;
- privacidad de los registros personales;
- correcciones con conservación del original;
- informes y cierres económicos;
- eliminación de información asociada a bajas;
- operaciones de mantenimiento reservadas al servidor.

La configuración privilegiada permanece fuera del código cliente.

## Documentación

La carpeta `docs/` contiene la documentación detallada del proyecto:

- `PUESTA_EN_MARCHA.md`: configuración completa del entorno;
- `VALIDACION.md`: pruebas y validaciones técnicas realizadas en la versión documentada;
- `DECISIONES.md`: decisiones funcionales y aclaraciones aprobadas;
- `originales/`: requisitos originales conservados como referencia.

> **Nota:** algunos documentos de validación reflejan el estado en la fecha en la que fueron redactados. Desde entonces el proyecto se ha conectado a servicios reales, se ha probado en Android y se han realizado compilaciones mediante EAS.

## Coste

El proyecto está planteado para mantenerse dentro de las cuotas gratuitas de los servicios utilizados siempre que el volumen de uso lo permita. No requiere contratar servicios de pago para su entorno previsto de pruebas y uso limitado.

## Estado del proyecto

Convivio continúa evolucionando mediante pruebas reales y ajustes de interfaz y funcionamiento. La versión actual ya dispone de infraestructura cloud, autenticación y compilación Android.
