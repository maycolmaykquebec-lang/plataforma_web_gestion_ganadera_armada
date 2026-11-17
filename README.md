# Plataforma para el registro y control de semovientes — Río Blanco

Unidad Operativa de Servicios y Producción Ganadera «RÍO BLANCO», Armada Boliviana.
Dependencia: DIV. «B» «PRODUCCIÓN» del DPTO. VII «PARTICIPACIÓN EN EL DESARROLLO».

## Base y alcance

Adaptación del proyecto entregado en ZIP al repositorio `plataforma_web_gestion_ganadera_armada`. Conserva React, Vite, Supabase y la apariencia institucional. La presentación se enfoca en Río Blanco; La estructura permite asignar responsables a Río Blanco, Tamarinero y Mamore, y dar supervisión general al Departamento VII y la División B.

Se incluyen las pantallas existentes de acceso, panel principal, semovientes, historial individual, control sanitario, control reproductivo e inventario. Incluye movimientos entre unidades: solicitud por el responsable de origen, autorización del Supervisor y confirmación del responsable de destino. Los módulos deshabilitados siguen en desarrollo. No se han agregado datos de demostración ni credenciales.

## Desarrollo

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los datos públicos del proyecto Supabase. Nunca usar `service_role` en Vite. Sin configuración se muestra el acceso con un aviso y el inicio de sesión deshabilitado.

```sh
npm run build
npm run preview
```

El alojamiento debe redirigir las rutas de la aplicación a `index.html`.

## Roles y unidades

- `SUP_DEPTO_VII`: supervisión de las tres unidades y autorización de movimientos.
- `JEFE_DIV_B`: consulta y supervisión de las tres unidades; no registra animales ni autoriza traslados.
- `RESP_UNIDAD`: registro de animales, controles sanitarios y reproductivos, consulta de historial, solicitudes de traslado en origen y recepción en destino, limitado a su unidad asignada.

Las unidades disponibles son `RIO-BLANCO`, `TAMARINERO` y `MAMORE`. Se mantiene Río Blanco como identidad y foco inicial de la plataforma. Los roles se validan en React y en PostgreSQL. El responsable debe tener una unidad válida y el perfil debe estar activo. No existe registro público que asigne permisos automáticamente.

## Conexión manual al proyecto existente

El proyecto indicado para la integración es `yxwgqxzskicddeukwvkk`. La URL y su clave publishable se configuran en `.env.local`, que Git ignora; no se incluye configuración real en `.env.example`. Reiniciar Vite después de cambiar estas variables y reconstruir el sitio al desplegarlo. Configurar la copia local no cambia las variables del alojamiento ni sube código a GitHub.

La comprobación remota verificó respuesta HTTP 200 del servicio Auth. Las consultas de cero filas del SDK a tablas protegidas devolvieron 401 / PostgreSQL `42501` sin sesión: la conexión llega al proyecto, pero no acredita acceso autenticado ni compatibilidad del esquema. No ampliar permisos anónimos para solucionar esa denegación. Para pruebas con Node en este entorno usar el proxy y CA del sistema (`NODE_USE_ENV_PROXY=1 node --use-system-ca ...`); el navegador usa su propia configuración de red.

**Esta base ya tiene tablas. No ejecutar las migraciones de instalación nueva en ella.** La captura muestra `divisiones`, que la base de instalación nueva representa de otra forma. Deben mantenerse la jerarquía, identificadores y datos existentes y preparar una migración de adaptación después de inspeccionar columnas, relaciones y políticas.

En SQL Editor, ejecutar `supabase/diagnostico/02_resumen_para_sql_editor.sql` y exportar el resultado para revisar columnas, relaciones, políticas y los catálogos de roles/unidades. No consulta cuentas, perfiles ni animales. El diagnóstico ampliado `01_inspeccionar_base_existente.sql` añade metadatos de privilegios, funciones y triggers sin consultar registros de la aplicación. Ambos son solo lectura. La clave publishable no permite ejecutar SQL administrativo ni migraciones.

## Adaptación a la estructura recibida

El diagnóstico del proyecto existente confirmó nueve roles, la jerarquía Departamento → División → Unidad, la columna de autoría `semovientes.created_by`, unicidad del código por unidad y la tabla `solicitudes_movimientos`. La pantalla de movimientos usa ahora esa tabla, sus estados y su fecha prevista obligatoria; no necesita una segunda tabla de movimientos.

Los scripts manuales para esa estructura están en `supabase/adaptacion`, separados de las migraciones para instalaciones vacías. **Todavía no se han aplicado al proyecto remoto.** Antes de ejecutarlos, revisar en SQL Editor `supabase/diagnostico/03_plan_adaptacion.sql`: devuelve recuentos agrupados de perfiles sin nombres y las automatizaciones existentes que podrían interferir.

- `01_roles_y_permisos.sql` habilita RLS y combina límites RESTRICTIVE con los permisos heredados. Solo admite los tres roles acordados, verificando Departamento/División/Unidad y estado activo; mantiene cuentas, asignaciones, datos y filas históricas del catálogo. Los otros seis códigos permanecen almacenados, pero no reciben acceso operativo ni aparecen en el catálogo autorizado de la aplicación. Este paso por sí solo no convierte especialistas o administradores antiguos en responsables de unidad.
- `02_movimientos.sql` añade RPC transaccionales sobre `solicitudes_movimientos`, sin recrearla. Solo el responsable de origen solicita, otro usuario Supervisor autoriza y el responsable de destino recibe. La recepción mantiene el ID del animal y su historia; una colisión de código en destino revierte toda la recepción. No convierte los códigos existentes en globalmente únicos.

El instalador retira primero los permisos PUBLIC/anon/authenticated de las cinco RPC heredadas diagnosticadas, sin borrar sus definiciones. Se detiene antes de continuar si detecta otras RPC privilegiadas sin revisar, triggers existentes en solicitudes, solicitudes abiertas duplicadas o una instalación ya aplicada. No eliminan automatizaciones heredadas para superar esos controles. Revisar también las definiciones de los triggers de semovientes: la prueba local reproduce la estructura recibida, no el código de triggers que no se haya compartido.

Aplicarlos primero sobre una copia de prueba de la base. El usuario autorizó explícitamente convertir las tres cuentas activas de Río Blanco con roles `OPERADOR`, `SANITARIO` y `REPRODUCTIVO` a `RESP_UNIDAD`. El paso `03_asignar_responsables_rio_blanco.sql` aplica solo esa decisión, verifica que el recuento siga siendo exactamente una cuenta de cada rol y guarda las asignaciones previas en `private.rb_respaldo_perfiles_adaptacion`. El respaldo habilita RLS explícitamente, sin políticas para clientes y con privilegios revocados a PUBLIC, anon y authenticated; el propietario administrativo puede crear y consultar las cuatro filas. Mantiene IDs, unidades y estado activo; no modifica contraseñas. Completa el departamento del único Supervisor si estaba vacío, pero rechaza un departamento ya asignado que sea diferente. No crea usuarios ni reasigna otras cuentas.

**Instalación manual:** ejecutar `npm run sql:preparar` y copiar COMPLETO `supabase/adaptacion/INSTALAR_BASE_EXISTENTE.sql` al SQL Editor del proyecto indicado. Ese archivo contiene los pasos 00→01→02→03 dentro de una sola transacción. No ejecutar los pasos sueltos en producción: si la adaptación falla, también se revierten la retirada de RPC antiguas y la asignación de perfiles. Al completar devuelve los recuentos: 3 responsables de Río Blanco y 1 Supervisor. Todavía no existe una cuenta `JEFE_DIV_B`: el rol está disponible, pero nadie ha sido inventado ni asignado a él.

El instalador está preparado y probado localmente; no se ha ejecutado en Supabase ni se ha subido a GitHub. Para publicar, el alojamiento debe usar la misma URL/clave pública configuradas localmente.

## Instalación de una base nueva en Supabase

Las migraciones de `supabase/migrations` constituyen la instalación completa para una base nueva. Aplicarlas en orden con Supabase CLI (`supabase db push` una vez vinculado un proyecto vacío) o en el SQL Editor. No ejecutarlas sobre las tablas de la instalación anterior. Los archivos de `supabase/sql` son el material histórico de referencia, NO una segunda secuencia de instalación.

1. `202611170001_base_institucional.sql`: tres roles, tres unidades, perfiles, semovientes y aislamiento RLS.
2. `202611170002_controles_historial.sql`: historial, sanidad, reproducción y validaciones de clasificación.
3. `202611170003_permisos_controles.sql`: escritura de controles solo por responsables de la unidad del animal.
4. `202611170004_movimientos.sql`: solicitudes, autorización y recepción atómicas con trazabilidad.

Crear las cuentas desde Supabase Auth y asignar sus perfiles mediante una sesión administrativa del SQL Editor; nunca desde el cliente web. Ejemplo, sustituyendo el UUID por el de una cuenta creada:

```sql
insert into public.perfiles(id,nombre_completo,activo,rol_id,unidad_id,departamento_id)
select 'UUID_DEL_USUARIO'::uuid,'Nombre del responsable',true,r.id,u.id,u.departamento_id
from public.roles_sistema r cross join public.unidades_operativas u
where r.codigo='RESP_UNIDAD' and u.codigo='RIO-BLANCO';
```

Para supervisión, asignar el rol correspondiente y `unidad_id = NULL` desde la administración. La aplicación no permite editar perfiles ni elevar privilegios. No se han creado cuentas, contraseñas o perfiles reales.

El cliente no puede escribir directamente movimientos ni cambiar la unidad de un animal. Solo puede usar las RPC `solicitar_movimiento`, `autorizar_movimiento` y `confirmar_recepcion`, que verifican el usuario real y el estado en el servidor. Solo puede existir un traslado abierto por animal. El animal permanece en origen hasta su recepción; el responsable de destino ve la solicitud y el ID del animal; la ficha y su código quedan disponibles según los permisos de la unidad actual. El código del semoviente se conserva en el traslado. En la base existente es único por unidad; una colisión en destino bloquea la recepción hasta resolverla administrativamente.

Esta primera versión no incluye rechazo, cancelación, entrega parcial, adjuntos ni firma documental de traslados. La tabla conserva solicitante, autorizador, receptor y fechas. El historial del animal queda disponible según su unidad actual; la solicitud conserva acceso para origen y destino.

## Módulos y actualización de la base existente

Los módulos Altas y Bajas, Evaluación para Descarte, Reportes, Usuarios, Auditoría y Respaldos se conectan a los datos autorizados por el perfil. El Supervisor administra perfiles de cuentas ya creadas en Supabase Auth; no se crean contraseñas desde la aplicación. Los respaldos descargables son exportaciones operativas, no reemplazan las copias completas de infraestructura de Supabase.

Para una base ya adaptada, ejecutar **una sola vez** `supabase/actualizaciones/01_modulos_pendientes.sql` en SQL Editor. El archivo está disponible también como `actualizacion-modulos.sql` en la raíz del sitio privado. Este paso es diferente del instalador inicial y agrega las tablas y funciones necesarias sin borrar datos. Hasta aplicarlo los nuevos módulos informan que la actualización está pendiente.

La baja por defunción crea un acontecimiento y permite preparar un acta basada en el documento proporcionado, con datos del animal registrados, dos nombres editables, espacios de firma y una fotografía opcional para esa impresión. La fotografía elegida permanece en el navegador y no se guarda en la base.

## AF-09

Excel e impresión se generan en el navegador y no requieren un servicio en localhost ni Excel de escritorio. Solo los nombres se editan. Si se dispone de una plantilla AF-09 compatible y sin firmas, puede seleccionarse al exportar; sin plantilla se genera un formato institucional con datos actuales y campos desconocidos en blanco. El modelo original no se encontraba en el archivo entregado, por lo que el formato generado no se presenta como copia exacta de la plantilla oficial.

Las seis fotografías del panel proceden de Wikimedia Commons. Sus autores, enlaces y licencias figuran en `public/images/semovientes/atribuciones.json` y en las tarjetas de la aplicación.

## Verificación y estado

Ejecutar `npm test` para las pruebas de permisos de interfaz y de base de datos. Las pruebas del Excel abren y verifican el archivo generado. Las suites de base instalan las migraciones nuevas y, por separado, la adaptación sobre un esquema heredado ficticio en PostgreSQL local mediante PGlite con un contexto Auth simulado; prueban RLS de las tres unidades, perfiles inactivos, denegación de elevación de permisos, controles sanitarios/reproductivos, acceso anónimo y el ciclo completo de traslado con denegaciones y trazabilidad.

La compilación de producción pasa. La integración con Supabase Auth/PostgREST y los flujos en navegador todavía requieren una instancia configurada. Las pruebas locales no validan concurrencia real ni la infraestructura remota. No se realizaron cambios en ninguna base remota.
