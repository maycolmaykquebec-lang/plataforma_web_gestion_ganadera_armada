# Actualización V4.2 — Cancelación documentada de traslados aprobados

**Proyecto:** Plataforma Web de Gestión Ganadera — Armada Boliviana.

## Qué incorpora

- En **Movimientos**, el supervisor (`SUP_DEPTO_VII`) dispone del botón **Cancelar traslado** cuando la solicitud está `aprobado` y no consta ejecución.
- Se exige una justificación real de **15 a 1000 caracteres**, una confirmación de que no se ejecutó el traslado y, opcionalmente, una referencia documental de hasta 200 caracteres.
- Se registra quién canceló, cuándo, por qué y la referencia opcional. **No se alteran** `autorizado_por`, `fecha_autorizacion`, `fundamento_decision` ni `referencia_decision` de la aprobación original.
- Se conserva un evento de cancelación en el expediente del semoviente y un registro de auditoría para el cambio de estado (automático, si el trigger institucional está activo; en otro caso, explícito).
- En **Altas y Bajas**, si se intenta dar de baja un animal con traslado abierto, aparece el motivo concreto del rechazo de Supabase.
- No cancela ni modifica automáticamente ninguna solicitud existente. En particular, la **solicitud 3 del semoviente 009** seguirá `aprobado` hasta que un supervisor autorizado la cancele expresamente con motivos reales.

## Archivos reemplazados

```text
src/pages/MovimientosPage.jsx
src/pages/MovimientosPage.css
src/pages/AltasBajasPage.jsx
```

El archivo de Altas y Bajas parte de **V4**, que es compatible con **V4.1** (V4.1 solo cambió su CSS, ActaDefuncionPanel y el servicio Word). No se incluye ningún archivo del módulo fotográfico ni de Control Reproductivo.

## SQL incluido

```text
supabase/actualizaciones/07_cancelar_traslado_aprobado.sql
supabase/actualizaciones/08_verificar_cancelacion_traslado.sql
```

**No vuelva a ejecutar las migraciones 01-06.** SQL 07 instala una función nueva, agrega cuatro columnas de cancelación y no altera las RPC de aprobar, decidir y confirmar recepción. El SQL 08 es de solo lectura.

## Instalación recomendada

1. Haga un respaldo de la base real y preferiblemente pruebe SQL 07 en una copia.
2. Confirme que el repositorio local contiene la V4.1 y no tiene cambios sin respaldar:

```powershell
cd "C:\Users\Lenovo LOQ\plataforma_web_gestion_ganadera_armada"
git status
```

3. En **Supabase → SQL Editor**, pegue **únicamente** `07_cancelar_traslado_aprobado.sql` y ejecútelo **una sola vez**. Si hay un aviso de riesgo, revise que realmente sea el archivo 07 y que tenga copia de seguridad antes de continuar.
4. En otra consulta ejecute `08_verificar_cancelacion_traslado.sql`. El primer resultado debe contener tres `true`. La consulta de solicitud 3 mostrará inicialmente `aprobado`; el SQL de instalación NO la cancela.
5. Pare Vite con **Ctrl + C**. Con el ZIP descargado en Descargas, ejecute:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\actualizacion_movimientos_cancelacion_v4_2.zip" -DestinationPath (Get-Location).Path -Force
npm.cmd run dev
```

6. Acceda con **SUP_DEPTO_VII → Movimientos**. Abra una solicitud aprobada no ejecutada, compruebe que se ve el botón **Cancelar traslado**, registre una justificación auténtica y confirme solo si la operación corresponde a un hecho real.
7. Tras una cancelación autorizada, verifique en Supabase que `solicitudes_movimientos.estado='cancelado'` y que `fecha_ejecucion` sigue `NULL`. El rol `RESP_UNIDAD` de origen podrá entonces registrar la baja, si cumple las demás validaciones.

## Seguridad y límites

- La interfaz oculta el botón para otros roles, pero **Supabase vuelve a verificar** la identidad autenticada, el rol supervisor, el ámbito institucional y el estado del traslado.
- Una aprobación ejecutada, cancelada o rechazada no puede cancelarse de nuevo.
- El procedimiento no inventa una defunción ni ejecuta una baja: la baja sigue siendo una operación independiente del responsable de unidad.
- La cancelación usa bloqueo de fila y se ejecuta en una sola transacción para impedir cancelaciones simultáneas o parciales.
- No requiere claves secretas; **no use** `service_role` en React.
- **Pruebas locales:** se comprobó la sintaxis TSX/JSX, estructura del ZIP y presencia de reglas SQL. No se ejecutaron acciones sobre Supabase remoto. Realice la prueba funcional con una cuenta `SUP_DEPTO_VII` autorizada.

## En caso de error

Si la migración falla, **no** ejecute SQLs anteriores ni modifique `estado` mediante `UPDATE` manual. Comparta el texto del error. Si falla la cancelación en la web, copie el mensaje rojo y compruebe que SQL 08 haya dado `true`.
