begin;
GRANT INSERT (
  semoviente_id, tipo_control, fecha_control, responsable_sanitario,
  motivo, diagnostico, producto, dosis, unidad_dosis,
  via_administracion, lote_producto, proximo_control, observaciones
) ON TABLE public.controles_sanitarios TO authenticated;
create policy controles_sanitarios_registro_unidad on public.controles_sanitarios for insert to authenticated with check (
 private.rol_actual()='RESP_UNIDAD' and registrado_por=auth.uid() and exists (
 select 1 from public.semovientes s where s.id=semoviente_id and s.unidad_id=private.unidad_actual() and s.estado='Activo'));
GRANT INSERT (
  semoviente_id, tipo_evento, fecha_evento,
  responsable_reproductivo, resultado, detalle,
  reproductor_codigo, metodo, fecha_parto_probable,
  cantidad_crias, crias_codigos_referencia,
  cantidad_huevos, huevos_fertiles, nacidos_eclosion,
  proximo_control, observaciones
) ON TABLE public.controles_reproductivos TO authenticated;
create policy controles_reproductivos_registro_unidad on public.controles_reproductivos for insert to authenticated with check (
 private.rol_actual()='RESP_UNIDAD' and registrado_por=auth.uid() and exists (
 select 1 from public.semovientes s where s.id=semoviente_id and s.unidad_id=private.unidad_actual() and s.estado='Activo'));
commit;
