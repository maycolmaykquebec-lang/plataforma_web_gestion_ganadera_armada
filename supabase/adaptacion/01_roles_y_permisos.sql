-- SOLO para la base existente diagnosticada. No crea tablas ni reasigna cuentas.
-- Transacción única. Aplicar primero en una copia de prueba.
begin;
DO $$
declare t text;
begin
 foreach t in array array['roles_sistema','perfiles','departamentos','divisiones','unidades_operativas','semovientes','semoviente_eventos','controles_sanitarios','controles_reproductivos','reproduccion_crias_vinculadas','solicitudes_movimientos'] loop
  if to_regclass('public.'||t) is null then raise exception 'Falta la tabla public.%',t; end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and p.prokind='f'
   and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
   and has_function_privilege('authenticated',p.oid,'EXECUTE')) then
  raise exception 'Hay RPC SECURITY DEFINER heredadas accesibles; revisar antes de adaptar permisos';
 end if;
 if to_regprocedure('private.rb_rol_actual()') is not null then raise exception 'Adaptación instalada; no repetir'; end if;
 if (select count(*) from public.roles_sistema where codigo in ('SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD'))<>3 then raise exception 'Faltan roles acordados'; end if;
 if (select count(*) from public.unidades_operativas where codigo in ('RIO-BLANCO','TAMARINERO','MAMORE'))<>3 then raise exception 'Faltan unidades acordadas'; end if;
end $$;
create schema if not exists private;
grant usage on schema private to authenticated;
create function private.rb_puede_consultar_unidad(p_unidad bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.perfiles p
  join public.roles_sistema r on r.id=p.rol_id
  join public.unidades_operativas u on u.id=p_unidad
  join public.divisiones v on v.id=u.division_id
  join public.departamentos d on d.id=v.departamento_id
  where p.id=auth.uid() and p.activo and u.activo and v.activo and d.activo
  and u.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')
  and ((r.codigo='SUP_DEPTO_VII' and p.departamento_id=d.id)
    or (r.codigo='JEFE_DIV_B' and p.division_id=v.id and (p.departamento_id is null or p.departamento_id=d.id))
    or (r.codigo='RESP_UNIDAD' and p.unidad_id=u.id
      and (p.division_id is null or p.division_id=v.id)
      and (p.departamento_id is null or p.departamento_id=d.id)))
 )
$$;
create function private.rb_rol_actual() returns text
language sql stable security definer set search_path='' as $$
 select r.codigo::text from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.id=auth.uid() and p.activo and r.codigo in ('SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD')
 and exists(select 1 from public.unidades_operativas u where private.rb_puede_consultar_unidad(u.id))
$$;
create function private.rb_unidad_actual() returns bigint
language sql stable security definer set search_path='' as $$
 select p.unidad_id from public.perfiles p where p.id=auth.uid() and private.rb_rol_actual()='RESP_UNIDAD'
$$;
revoke all on function private.rb_puede_consultar_unidad(bigint),private.rb_rol_actual(),private.rb_unidad_actual() from public,anon;
grant execute on function private.rb_puede_consultar_unidad(bigint),private.rb_rol_actual(),private.rb_unidad_actual() to authenticated;
-- Revocar también privilegios por columna: REVOKE a nivel de tabla no los elimina.
DO $permisos$
declare t text; columnas text; lectura text; escritura text;
begin
 foreach t in array array['roles_sistema','perfiles','departamentos','divisiones','unidades_operativas','semovientes','semoviente_eventos','controles_sanitarios','controles_reproductivos','reproduccion_crias_vinculadas','solicitudes_movimientos'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  select string_agg(quote_ident(attname),',') into columnas from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
  execute format('revoke all (%s) on public.%I from public,anon,authenticated',columnas,t);
  execute format('grant select on public.%I to authenticated',t);
  lectura := case t
   when 'roles_sistema' then $$private.rb_rol_actual() is not null and codigo in ('SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD')$$
   when 'perfiles' then 'id=auth.uid()'
   when 'departamentos' then 'exists(select 1 from public.unidades_operativas u join public.divisiones v on v.id=u.division_id where v.departamento_id=departamentos.id and private.rb_puede_consultar_unidad(u.id))'
   when 'divisiones' then 'exists(select 1 from public.unidades_operativas u where u.division_id=divisiones.id and private.rb_puede_consultar_unidad(u.id))'
   when 'unidades_operativas' then $$private.rb_rol_actual() is not null and activo and codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')$$
   when 'semovientes' then 'private.rb_puede_consultar_unidad(unidad_id)'
   when 'semoviente_eventos' then 'exists(select 1 from public.semovientes s where s.id=semoviente_eventos.semoviente_id)'
   when 'controles_sanitarios' then 'exists(select 1 from public.semovientes s where s.id=controles_sanitarios.semoviente_id)'
   when 'controles_reproductivos' then 'exists(select 1 from public.semovientes s where s.id=controles_reproductivos.semoviente_id)'
   when 'reproduccion_crias_vinculadas' then 'exists(select 1 from public.controles_reproductivos r join public.semovientes s on s.id=reproduccion_crias_vinculadas.cria_id where r.id=reproduccion_crias_vinculadas.control_id)'
   when 'solicitudes_movimientos' then $$private.rb_rol_actual() is not null and ((private.rb_rol_actual() in ('SUP_DEPTO_VII','JEFE_DIV_B') and private.rb_puede_consultar_unidad(unidad_origen_id) and private.rb_puede_consultar_unidad(unidad_destino_id)) or (private.rb_rol_actual()='RESP_UNIDAD' and private.rb_unidad_actual() in (unidad_origen_id,unidad_destino_id)))$$
  end;
  -- Los permisos heredados se conservan, pero no pueden superar estas barreras AND.
  execute format('create policy rb_limite_lectura on public.%I as restrictive for select to authenticated using (%s)',t,lectura);
  execute format('create policy rb_lectura on public.%I for select to authenticated using (%s)',t,lectura);
  escritura := case t
   when 'semovientes' then $$private.rb_rol_actual()='RESP_UNIDAD' and unidad_id=private.rb_unidad_actual() and created_by=auth.uid() and estado='Activo'$$
   when 'controles_sanitarios' then $$private.rb_rol_actual()='RESP_UNIDAD' and registrado_por=auth.uid() and exists(select 1 from public.semovientes s where s.id=controles_sanitarios.semoviente_id and s.unidad_id=private.rb_unidad_actual() and s.estado='Activo')$$
   when 'controles_reproductivos' then $$private.rb_rol_actual()='RESP_UNIDAD' and registrado_por=auth.uid() and exists(select 1 from public.semovientes s where s.id=controles_reproductivos.semoviente_id and s.unidad_id=private.rb_unidad_actual() and s.estado='Activo')$$
   else 'false'
  end;
  execute format('create policy rb_limite_insert on public.%I as restrictive for insert to authenticated with check (%s)',t,escritura);
  if t in ('semovientes','controles_sanitarios','controles_reproductivos') then
   execute format('create policy rb_insert on public.%I for insert to authenticated with check (%s)',t,escritura);
  end if;
  execute format('create policy rb_no_update on public.%I as restrictive for update to authenticated using (false)',t);
  execute format('create policy rb_no_delete on public.%I as restrictive for delete to authenticated using (false)',t);
 end loop;
end $permisos$;
alter table public.semovientes alter column unidad_id set default private.rb_unidad_actual();
grant insert(codigo,especie,categoria,sexo,raza,fecha_nacimiento,fecha_ingreso,procedencia,marca_ancla,vacuna_brucelosis,observaciones) on public.semovientes to authenticated;
grant insert(semoviente_id,tipo_control,fecha_control,responsable_sanitario,motivo,diagnostico,producto,dosis,unidad_dosis,via_administracion,lote_producto,proximo_control,observaciones) on public.controles_sanitarios to authenticated;
grant insert(semoviente_id,tipo_evento,fecha_evento,responsable_reproductivo,resultado,detalle,reproductor_codigo,metodo,fecha_parto_probable,cantidad_crias,crias_codigos_referencia,cantidad_huevos,huevos_fertiles,nacidos_eclosion,proximo_control,observaciones) on public.controles_reproductivos to authenticated;
commit;
