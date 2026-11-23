# Bajas, cancelación pendiente y acta de defunción

Esta actualización parte de V4.7 y conserva el flujo V4.2 para cancelar traslados aprobados. Agrega una cancelación para las solicitudes **pendientes**, sin autorizarlas previamente. Solo el Supervisor Departamento VII puede cancelarlas, con justificación y constancia en historial y auditoría; la baja sigue siendo un acto independiente del responsable de unidad.

En Supabase, tras verificar que V4.2 ya está instalada y contar con respaldo, ejecute una sola vez `supabase/actualizaciones/11_cancelar_traslado_pendiente.sql`. Después ejecute la consulta de solo lectura `12_verificar_cancelacion_pendiente.sql`: debe mostrar `true, true, true, false`. Si el script informa que ya está instalado o falla, no lo repita sin revisar. No se vuelve a ejecutar el instalador inicial ni las migraciones anteriores. La instalación no cancela solicitudes ni registra bajas por sí misma.

Para comprobar en un entorno de pruebas:

1. Entre como supervisor y cancele una solicitud pendiente o aprobada, siempre que corresponda, con una justificación real. Compruebe que se conserve el historial.
2. Entre como responsable de origen y registre la baja correspondiente. Una solicitud abierta continúa bloqueando la baja.
3. En **Bajas registradas → Preparar documento**, confirme que la foto mostrada corresponda a la baja. Introduzca grado y nombre del vaquero y del jefe, y descargue el Word.
4. Abra el archivo en Word y compruebe la fotografía y ambos nombres en el cuerpo y en las firmas. Si la foto no está disponible, revise la conexión, el archivo `bajas-fotos/{unidad_id}/{baja_id}/evidencia.jpg` y sus permisos. Use **Volver a consultar fotografía**; no vuelva a registrar la baja.

La fotografía se coloca dentro de la tabla del acta para evitar que tape los nombres. Si se cambia de una baja a otra, el formulario vuelve a empezar vacío. No se copian firmas ni sellos. La prueba con una imagen privada real depende de una sesión autorizada de Supabase y sigue siendo necesaria en el equipo del usuario.
