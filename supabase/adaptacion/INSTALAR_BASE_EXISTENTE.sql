-- PLATAFORMA RÍO BLANCO: adaptación de la base existente diagnosticada.
-- Proyecto: yxwgqxzskicddeukwvkk. Revisar y ejecutar COMPLETO en SQL Editor.
-- Incluye la decisión autorizada: tres cuentas antiguas de Río Blanco -> RESP_UNIDAD.
-- Se conservan Auth, animales, historia, funciones antiguas y respaldos de perfiles.
-- Retira permiso EXECUTE al navegador sobre las cinco RPC antiguas.
-- Instalación única: ante cualquier error se revierte TODA la transacción.
-- No ejecutar junto con supabase/migrations (son para bases vacías).
-- Generado por scripts/preparar-instalador-supabase.mjs.

begin;

-- === 00_retirar_rpc_anteriores.sql ===
-- Retira el acceso del navegador a las cinco funciones heredadas diagnosticadas.
-- Conserva funciones y datos; los propietarios siguen pudiendo inspeccionarlas.
-- Usar el instalador consolidado para que toda la adaptación sea atómica.

DO $$
declare firma text; funcion regprocedure;
begin
 foreach firma in array array[
  'public.sigha_20316_solicitar_traslado(bigint,bigint,date,text,text,text)',
  'public.sigha_20320_decidir_traslado(bigint,text,text,text)',
  'public.sigha_20321_listar_pendientes()',
  'public.sigha_20421_ejecutar_traslado(bigint)',
  'public.sigha_20423_listar_aprobados()'
 ] loop
  funcion := to_regprocedure(firma);
  if funcion is null then raise exception 'No coincide el diagnóstico; falta función %',firma; end if;
  execute format('revoke all on function %s from public,anon,authenticated',funcion);
  if has_function_privilege('authenticated',funcion,'EXECUTE') or has_function_privilege('anon',funcion,'EXECUTE') then
   raise exception 'La función % conserva permisos heredados de otro rol; revisar ACL',firma;
  end if;
 end loop;
end $$;


-- === 01_roles_y_permisos.sql ===
-- SOLO para la base existente diagnosticada. No crea tablas ni reasigna cuentas.
-- Transacción única. Aplicar primero en una copia de prueba.

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


-- === 02_movimientos.sql ===
-- Depende de 01_roles_y_permisos.sql. Usa exclusivamente la tabla existente.

DO $$
begin
 if to_regprocedure('private.rb_rol_actual()') is null then raise exception 'Instalar primero adaptación 01'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.solicitudes_movimientos'::regclass and not tgisinternal and tgenabled<>'D') then
  raise exception 'Revisar triggers existentes en solicitudes_movimientos antes de instalar RPC';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('solicitar_movimiento','autorizar_movimiento','confirmar_recepcion')) then
  raise exception 'Ya existen RPC de movimientos; comparar definiciones antes de instalar';
 end if;
 if pg_get_serial_sequence('public.solicitudes_movimientos','id') is null then
  raise exception 'solicitudes_movimientos.id requiere generación automática compatible';
 end if;
 if exists(select 1 from public.solicitudes_movimientos where estado in ('pendiente','aprobado') group by semoviente_id having count(*)>1) then
  raise exception 'Existen solicitudes abiertas duplicadas; revisar sin eliminar registros';
 end if;
end $$;
create unique index rb_una_solicitud_abierta on public.solicitudes_movimientos(semoviente_id) where estado in ('pendiente','aprobado');
create function public.solicitar_movimiento(p_semoviente bigint,p_destino bigint,p_motivo text,p_fecha_prevista date)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public.semovientes; nuevo_id bigint;
begin
 if private.rb_rol_actual() is distinct from 'RESP_UNIDAD' then raise exception 'Solo el responsable de origen solicita' using errcode='42501'; end if;
 if p_fecha_prevista is null or p_motivo is null or length(btrim(p_motivo)) not between 10 and 1000 then raise exception 'Fecha o motivo inválidos' using errcode='23514'; end if;
 select * into a from public.semovientes where id=p_semoviente for update;
 if not found or a.unidad_id is distinct from private.rb_unidad_actual() or a.estado<>'Activo' then raise exception 'Animal no disponible en su unidad' using errcode='42501'; end if;
 if p_destino=a.unidad_id or not exists(
  select 1 from public.unidades_operativas o join public.unidades_operativas d on d.division_id=o.division_id
  where o.id=a.unidad_id and d.id=p_destino and d.activo and d.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')
 ) then raise exception 'Destino no válido' using errcode='23514'; end if;
 insert into public.solicitudes_movimientos(semoviente_id,unidad_origen_id,unidad_destino_id,fecha_prevista,motivo,solicitado_por)
 values(a.id,a.unidad_id,p_destino,p_fecha_prevista,btrim(p_motivo),auth.uid()) returning id into nuevo_id;
 return nuevo_id;
end $$;
create function public.autorizar_movimiento(p_movimiento bigint)
returns void language plpgsql security definer set search_path='' as $$
declare m public.solicitudes_movimientos;
begin
 if private.rb_rol_actual() is distinct from 'SUP_DEPTO_VII' then raise exception 'Solo el Supervisor autoriza' using errcode='42501'; end if;
 select * into m from public.solicitudes_movimientos where id=p_movimiento for update;
 if not found or m.estado<>'pendiente' then raise exception 'Solicitud no disponible' using errcode='23514'; end if;
 if auth.uid()=m.solicitado_por or not private.rb_puede_consultar_unidad(m.unidad_origen_id) or not private.rb_puede_consultar_unidad(m.unidad_destino_id) then raise exception 'Autorización fuera de alcance o propia' using errcode='42501'; end if;
 perform 1 from public.semovientes where id=m.semoviente_id and unidad_id=m.unidad_origen_id and estado='Activo' for update;
 if not found then raise exception 'El animal no está disponible en origen' using errcode='23514'; end if;
 if not exists(select 1 from public.unidades_operativas o join public.unidades_operativas d on d.division_id=o.division_id
   where o.id=m.unidad_origen_id and d.id=m.unidad_destino_id and o.id<>d.id and o.activo and d.activo
   and o.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE') and d.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')) then
  raise exception 'Las unidades ya no forman una ruta válida' using errcode='23514';
 end if;
 update public.solicitudes_movimientos set estado='aprobado',autorizado_por=auth.uid(),fecha_autorizacion=now(),actualizado_en=now() where id=m.id;
end $$;
create function public.confirmar_recepcion(p_movimiento bigint)
returns void language plpgsql security definer set search_path='' as $$
declare m public.solicitudes_movimientos; a public.semovientes;
begin
 if private.rb_rol_actual() is distinct from 'RESP_UNIDAD' then raise exception 'Solo el responsable de destino confirma' using errcode='42501'; end if;
 select * into m from public.solicitudes_movimientos where id=p_movimiento for update;
 if not found or m.estado<>'aprobado' or m.unidad_destino_id is distinct from private.rb_unidad_actual() then raise exception 'Recepción no autorizada' using errcode='42501'; end if;
 if not exists(select 1 from public.unidades_operativas o join public.unidades_operativas d on d.division_id=o.division_id
   where o.id=m.unidad_origen_id and d.id=m.unidad_destino_id and o.id<>d.id and o.activo and d.activo
   and o.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE') and d.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')) then
  raise exception 'Las unidades ya no forman una ruta válida' using errcode='23514';
 end if;
 select * into a from public.semovientes where id=m.semoviente_id for update;
 if not found or a.unidad_id<>m.unidad_origen_id or a.estado<>'Activo' then raise exception 'El animal no está disponible en origen' using errcode='23514'; end if;
 if exists(select 1 from public.semovientes s where s.unidad_id=m.unidad_destino_id and s.codigo=a.codigo and s.id<>a.id) then raise exception 'El código ya existe en destino; no se ha realizado el traslado' using errcode='23505'; end if;
 update public.semovientes set unidad_id=m.unidad_destino_id where id=m.semoviente_id;
 update public.solicitudes_movimientos set estado='ejecutado',ejecutado_por=auth.uid(),fecha_ejecucion=now(),actualizado_en=now() where id=m.id;
 insert into public.semoviente_eventos(semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,origen_registro_id,datos_adicionales,registrado_por)
 values(m.semoviente_id,'movimiento',now(),'Traslado recibido',m.motivo,'movimientos','solicitud_movimiento:'||m.id::text,
 jsonb_build_object('unidad_origen_id',m.unidad_origen_id,'unidad_destino_id',m.unidad_destino_id,'autorizado_por',m.autorizado_por,'fecha_prevista',m.fecha_prevista),auth.uid());
end $$;
revoke all on function public.solicitar_movimiento(bigint,bigint,text,date),public.autorizar_movimiento(bigint),public.confirmar_recepcion(bigint) from public,anon;
grant execute on function public.solicitar_movimiento(bigint,bigint,text,date),public.autorizar_movimiento(bigint),public.confirmar_recepcion(bigint) to authenticated;


-- === 03_asignar_responsables_rio_blanco.sql ===
-- Autorizado por el usuario: las tres cuentas activas OPERADOR/SANITARIO/
-- REPRODUCTIVO de Río Blanco pasan a RESP_UNIDAD, con sus funciones completas.
-- No cambia contraseñas, usuarios de Auth, estado activo ni unidades.

create table private.rb_respaldo_perfiles_adaptacion (
 perfil_id uuid primary key,
 rol_id bigint not null, unidad_id bigint, division_id bigint, departamento_id bigint,
 activo boolean not null, respaldado_en timestamptz not null default now()
);
-- Sin políticas para clientes: el respaldo solo es accesible al propietario administrativo.
alter table private.rb_respaldo_perfiles_adaptacion enable row level security;
revoke all on private.rb_respaldo_perfiles_adaptacion from public,anon,authenticated;
DO $$
declare unidad bigint; division bigint; departamento bigint; responsable bigint; cantidad bigint;
begin
 select u.id,u.division_id,v.departamento_id into strict unidad,division,departamento
 from public.unidades_operativas u join public.divisiones v on v.id=u.division_id
 join public.departamentos d on d.id=v.departamento_id
 where u.codigo='RIO-BLANCO' and u.activo and v.activo and d.activo;
 select id into strict responsable from public.roles_sistema where codigo='RESP_UNIDAD';
 -- Evita aplicar el plan a cuentas distintas si la base cambió desde el diagnóstico.
 lock table public.perfiles in share row exclusive mode;
 select count(*) into cantidad from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO');
 if cantidad<>3 or exists(
  select 1 from (values('OPERADOR'),('SANITARIO'),('REPRODUCTIVO')) expected(codigo)
  where (select count(*) from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
   where p.activo and p.unidad_id=unidad and r.codigo=expected.codigo)<>1
 ) then raise exception 'Las tres cuentas ya no coinciden con el diagnóstico; no se reasignó ninguna'; end if;
 if exists(select 1 from public.perfiles p join public.roles_sistema r on r.id=p.rol_id where p.activo and
  ((p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO')
    and ((p.division_id is not null and p.division_id<>division) or (p.departamento_id is not null and p.departamento_id<>departamento)))
   or (r.codigo='SUP_DEPTO_VII' and p.departamento_id is not null and p.departamento_id<>departamento))) then
  raise exception 'Hay asignaciones de ámbito incompatibles; revisar sin sobrescribirlas';
 end if;
 select count(*) into cantidad from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and r.codigo='SUP_DEPTO_VII';
 if cantidad<>1 then raise exception 'Se esperaba un Supervisor activo, según diagnóstico'; end if;
 insert into private.rb_respaldo_perfiles_adaptacion(perfil_id,rol_id,unidad_id,division_id,departamento_id,activo)
 select p.id,p.rol_id,p.unidad_id,p.division_id,p.departamento_id,p.activo
 from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 where p.activo and ((p.unidad_id=unidad and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO')) or r.codigo='SUP_DEPTO_VII');
 update public.perfiles p set rol_id=responsable,division_id=division,departamento_id=departamento,updated_at=now()
 from public.roles_sistema r where r.id=p.rol_id and p.activo and p.unidad_id=unidad
 and r.codigo in ('OPERADOR','SANITARIO','REPRODUCTIVO');
 -- Completa únicamente un ámbito faltante; no sobrescribe uno diferente.
 update public.perfiles p set departamento_id=departamento,updated_at=now()
 from public.roles_sistema r where r.id=p.rol_id and p.activo and r.codigo='SUP_DEPTO_VII' and p.departamento_id is null;
end $$;

-- Resultado final sin nombres, correos ni UUID de usuarios.
select r.codigo as rol, u.codigo as unidad, count(*) as cuentas_activas
from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
left join public.unidades_operativas u on u.id=p.unidad_id
where p.activo group by r.codigo,u.codigo order by r.codigo,u.codigo;
commit;
