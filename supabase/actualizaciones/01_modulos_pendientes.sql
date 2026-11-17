-- Actualización incremental para la base EXISTENTE ya adaptada con los scripts 00–03.
-- No reinstala la base ni reasigna cuentas. Ejecutar una sola vez en SQL Editor.
-- Una sola transacción: ante cualquier error no queda una instalación parcial.
begin;
DO $$
declare t text;
begin
 if to_regprocedure('private.rb_rol_actual()') is null
 or to_regprocedure('private.rb_unidad_actual()') is null
 or to_regprocedure('private.rb_puede_consultar_unidad(bigint)') is null then
  raise exception 'Primero debe instalarse la adaptación de roles y unidades';
 end if;
 foreach t in array array['semovientes','semoviente_eventos','controles_sanitarios','controles_reproductivos','solicitudes_movimientos','perfiles','unidades_operativas','divisiones','departamentos','roles_sistema'] loop
  if to_regclass('public.'||t) is null then raise exception 'Falta public.%',t; end if;
 end loop;
 if to_regclass('public.rb_bajas') is not null or to_regclass('public.rb_evaluaciones_descarte') is not null or to_regclass('public.rb_auditoria') is not null then
  raise exception 'La actualización ya existe o hay objetos con esos nombres; no repetir';
 end if;
end $$;

create table public.rb_bajas (
 id bigint generated always as identity primary key,
 semoviente_id bigint not null unique references public.semovientes(id),
 unidad_id bigint not null references public.unidades_operativas(id),
 tipo text not null check(tipo in ('defuncion','venta','sacrificio','otro')),
 fecha date not null,
 motivo text not null check(length(btrim(motivo)) between 10 and 2000),
 detalles jsonb not null default '{}'::jsonb check(jsonb_typeof(detalles)='object'),
 registrado_por uuid not null references auth.users(id),
 registrado_en timestamptz not null default now()
);
create table public.rb_evaluaciones_descarte (
 id bigint generated always as identity primary key,
 semoviente_id bigint not null references public.semovientes(id),
 unidad_id bigint not null references public.unidades_operativas(id),
 fecha date not null,
 motivo text not null check(length(btrim(motivo)) between 10 and 2000),
 dictamen text not null check(dictamen in ('candidato','no_recomendado','seguimiento')),
 registrado_por uuid not null references auth.users(id),
 registrado_en timestamptz not null default now()
);
create table public.rb_auditoria (
 id bigint generated always as identity primary key,
 fecha timestamptz not null default now(),
 actor_id uuid,
 unidad_id bigint references public.unidades_operativas(id),
 tabla text not null,
 registro_id text not null,
 accion text not null check(accion in ('INSERT','UPDATE','DELETE')),
 detalle jsonb not null default '{}'::jsonb check(jsonb_typeof(detalle)='object')
);
create index rb_bajas_unidad_fecha on public.rb_bajas(unidad_id,fecha desc);
create index rb_descarte_animal_fecha on public.rb_evaluaciones_descarte(semoviente_id,fecha desc);
create index rb_descarte_unidad_fecha on public.rb_evaluaciones_descarte(unidad_id,fecha desc);
create index rb_auditoria_unidad_fecha on public.rb_auditoria(unidad_id,fecha desc);

alter table public.rb_bajas enable row level security;
alter table public.rb_evaluaciones_descarte enable row level security;
alter table public.rb_auditoria enable row level security;
revoke all on public.rb_bajas,public.rb_evaluaciones_descarte,public.rb_auditoria from public,anon,authenticated;
grant select on public.rb_bajas,public.rb_evaluaciones_descarte,public.rb_auditoria to authenticated;
create policy rb_bajas_lectura on public.rb_bajas for select to authenticated using(private.rb_puede_consultar_unidad(unidad_id));
create policy rb_descarte_lectura on public.rb_evaluaciones_descarte for select to authenticated using(private.rb_puede_consultar_unidad(unidad_id));
-- El historial de actividad se limita por unidad. Actividad de perfiles generales
-- sin unidad: únicamente supervisión de su propio departamento/división.
create policy rb_auditoria_lectura on public.rb_auditoria for select to authenticated using(
 private.rb_rol_actual() is not null and (
  (unidad_id is not null and private.rb_puede_consultar_unidad(unidad_id))
  or (unidad_id is null and exists (
   select 1 from public.perfiles p where p.id=auth.uid() and p.activo and (
    (private.rb_rol_actual()='SUP_DEPTO_VII' and (detalle->>'departamento_id')::bigint=p.departamento_id)
    or (private.rb_rol_actual()='JEFE_DIV_B' and (detalle->>'division_id')::bigint=p.division_id)
   )
  ))
 )
);

create function public.rb_registrar_baja(p_semoviente bigint,p_tipo text,p_fecha date,p_motivo text,p_detalles jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public.semovientes; nueva bigint; hora text;
begin
 if private.rb_rol_actual() is distinct from 'RESP_UNIDAD' then raise exception 'Solo el responsable de unidad registra una baja' using errcode='42501'; end if;
 select * into a from public.semovientes where id=p_semoviente for update;
 if not found or a.unidad_id is distinct from private.rb_unidad_actual() or a.estado<>'Activo' then raise exception 'Animal no disponible en su unidad' using errcode='42501'; end if;
 if p_tipo is null or p_tipo not in ('defuncion','venta','sacrificio','otro')
 or p_fecha is null or p_fecha>(current_timestamp at time zone 'America/La_Paz')::date or p_fecha<a.fecha_ingreso
 or p_motivo is null or length(btrim(p_motivo)) not between 10 and 2000 then
  raise exception 'Tipo, fecha o motivo de baja inválidos' using errcode='23514';
 end if;
 if p_detalles is null or jsonb_typeof(p_detalles)<>'object' or octet_length(p_detalles::text)>8192 then
  raise exception 'Detalles del acta inválidos o demasiado extensos' using errcode='23514';
 end if;
 if exists(select 1 from jsonb_each(p_detalles) d(clave,valor)
  where clave not in ('hora','lugar','referencia_informe','marcado','descripcion')
  or jsonb_typeof(valor)<>'string'
  or length(valor#>>'{}') > case clave when 'hora' then 5 when 'lugar' then 300 when 'referencia_informe' then 250 when 'marcado' then 300 else 3000 end) then
  raise exception 'Campos del acta no permitidos o demasiado extensos' using errcode='23514';
 end if;
 hora:=nullif(btrim(p_detalles->>'hora'),'');
 if hora is not null then
  if hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'La hora debe tener formato HH:MM' using errcode='23514'; end if;
  if p_fecha+hora::time > (current_timestamp at time zone 'America/La_Paz') then raise exception 'La hora del acontecimiento no puede ser futura' using errcode='23514'; end if;
 end if;
 if exists(select 1 from public.solicitudes_movimientos m where m.semoviente_id=a.id and m.estado in ('pendiente','aprobado')) then
  raise exception 'El semoviente tiene un traslado abierto; resolverlo antes de la baja' using errcode='23514';
 end if;
 insert into public.rb_bajas(semoviente_id,unidad_id,tipo,fecha,motivo,detalles,registrado_por)
 values(a.id,a.unidad_id,p_tipo,p_fecha,btrim(p_motivo),p_detalles,auth.uid()) returning id into nueva;
 update public.semovientes set estado='Baja' where id=a.id;
 insert into public.semoviente_eventos(semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,origen_registro_id,datos_adicionales,registrado_por)
 values(a.id,'baja',p_fecha::timestamp at time zone 'America/La_Paz','Baja registrada: '||p_tipo,btrim(p_motivo),'altas_bajas','rb_baja:'||nueva,
 jsonb_build_object('baja_id',nueva,'tipo_baja',p_tipo,'unidad_id',a.unidad_id),auth.uid());
 return nueva;
end $$;

create function public.rb_evaluar_descarte(p_semoviente bigint,p_fecha date,p_motivo text,p_dictamen text)
returns bigint language plpgsql security definer set search_path='' as $$
declare a public.semovientes; nueva bigint;
begin
 if private.rb_rol_actual() is distinct from 'RESP_UNIDAD' then raise exception 'Solo el responsable de unidad registra una evaluación' using errcode='42501'; end if;
 select * into a from public.semovientes where id=p_semoviente for update;
 if not found or a.unidad_id is distinct from private.rb_unidad_actual() or a.estado<>'Activo' then raise exception 'Animal no disponible en su unidad' using errcode='42501'; end if;
 if p_dictamen is null or p_dictamen not in ('candidato','no_recomendado','seguimiento')
 or p_fecha is null or p_fecha>(current_timestamp at time zone 'America/La_Paz')::date or p_fecha<a.fecha_ingreso
 or p_motivo is null or length(btrim(p_motivo)) not between 10 and 2000 then
  raise exception 'Dictamen, fecha o motivo inválidos' using errcode='23514';
 end if;
 insert into public.rb_evaluaciones_descarte(semoviente_id,unidad_id,fecha,motivo,dictamen,registrado_por)
 values(a.id,a.unidad_id,p_fecha,btrim(p_motivo),p_dictamen,auth.uid()) returning id into nueva;
 insert into public.semoviente_eventos(semoviente_id,tipo_evento,fecha_evento,titulo,detalle,origen_modulo,origen_registro_id,datos_adicionales,registrado_por)
 values(a.id,'descarte',p_fecha::timestamp at time zone 'America/La_Paz','Evaluación de descarte: '||p_dictamen,btrim(p_motivo),'descarte','rb_evaluacion:'||nueva,
 jsonb_build_object('evaluacion_id',nueva,'dictamen',p_dictamen,'unidad_id',a.unidad_id),auth.uid());
 return nueva;
end $$;

-- Valida cualquier ámbito preexistente. Un perfil completamente sin ámbito
-- requiere revisión administrativa manual; no se reclama para un departamento.
create function private.rb_perfil_en_departamento(p_perfil uuid,p_departamento bigint)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.perfiles p
  left join public.divisiones v on v.id=p.division_id
  left join public.unidades_operativas u on u.id=p.unidad_id
  left join public.divisiones uv on uv.id=u.division_id
  where p.id=p_perfil
  and (p.departamento_id=p_departamento or v.departamento_id=p_departamento or uv.departamento_id=p_departamento)
  and (p.departamento_id is null or p.departamento_id=p_departamento)
  and (p.division_id is null or v.departamento_id=p_departamento)
  and (p.unidad_id is null or uv.departamento_id=p_departamento)
  and (p.division_id is null or p.unidad_id is null or p.division_id=u.division_id)
 )
$$;
revoke all on function private.rb_perfil_en_departamento(uuid,bigint) from public,anon,authenticated;

create function public.rb_listar_usuarios()
returns table(perfil_id uuid,nombre_completo text,cargo text,rol_codigo text,unidad_id bigint,unidad_codigo text,activo boolean,division_id bigint,departamento_id bigint)
language plpgsql stable security definer set search_path='' as $$
declare departamento bigint;
begin
 if private.rb_rol_actual() is distinct from 'SUP_DEPTO_VII' then raise exception 'Solo el Supervisor administra perfiles' using errcode='42501'; end if;
 select p.departamento_id into departamento from public.perfiles p where p.id=auth.uid();
 return query
 select p.id,p.nombre_completo::text,p.cargo::text,r.codigo::text,p.unidad_id,u.codigo::text,p.activo,p.division_id,p.departamento_id
 from public.perfiles p join public.roles_sistema r on r.id=p.rol_id
 left join public.unidades_operativas u on u.id=p.unidad_id
 where private.rb_perfil_en_departamento(p.id,departamento)
 order by p.nombre_completo,p.id;
end $$;

create function public.rb_guardar_perfil(p_perfil uuid,p_nombre text,p_cargo text,p_rol text,p_unidad bigint,p_activo boolean)
returns void language plpgsql security definer set search_path='' as $$
declare anterior public.perfiles; actor public.perfiles; departamento bigint; division bigint; rol bigint; existe boolean;
begin
 if private.rb_rol_actual() is distinct from 'SUP_DEPTO_VII' then raise exception 'Solo el Supervisor administra perfiles' using errcode='42501'; end if;
 select * into actor from public.perfiles where id=auth.uid(); departamento:=actor.departamento_id;
 if p_perfil is null or p_nombre is null or length(btrim(p_nombre)) not between 3 and 150
 or length(coalesce(p_cargo,''))>150 or p_activo is null
 or p_rol is null or p_rol not in ('SUP_DEPTO_VII','JEFE_DIV_B','RESP_UNIDAD') then
  raise exception 'Datos del perfil inválidos' using errcode='23514';
 end if;
 if not exists(select 1 from auth.users where id=p_perfil) then raise exception 'Primero debe existir la cuenta en Supabase Auth' using errcode='23514'; end if;
 select * into anterior from public.perfiles where id=p_perfil for update; existe:=found;
 if existe and not private.rb_perfil_en_departamento(anterior.id,departamento) then raise exception 'Perfil fuera de su departamento o con ámbito incoherente' using errcode='42501'; end if;
 select r.id into strict rol from public.roles_sistema r where r.codigo=p_rol;
 if p_rol='RESP_UNIDAD' then
  select u.division_id into division from public.unidades_operativas u join public.divisiones v on v.id=u.division_id
  join public.departamentos d on d.id=v.departamento_id
  where u.id=p_unidad and u.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE') and u.activo and v.activo and d.activo and v.departamento_id=departamento;
  if not found then raise exception 'Unidad no válida para su departamento' using errcode='42501'; end if;
 else
  if p_unidad is not null then raise exception 'El rol de supervisión no se asigna a una unidad' using errcode='23514'; end if;
  if p_rol='JEFE_DIV_B' then
   if (select count(distinct u.division_id) from public.unidades_operativas u join public.divisiones v on v.id=u.division_id
    where u.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE') and u.activo and v.activo and v.departamento_id=departamento)<>1 then
    raise exception 'No se puede determinar una División B única en su departamento' using errcode='23514';
   end if;
   select distinct u.division_id into division from public.unidades_operativas u join public.divisiones v on v.id=u.division_id
   where u.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE') and u.activo and v.activo and v.departamento_id=departamento;
  else division:=null;
  end if;
 end if;
 if p_perfil=auth.uid() and (not existe or anterior.rol_id<>rol or anterior.activo is distinct from p_activo
 or anterior.unidad_id is distinct from p_unidad or anterior.division_id is distinct from division or anterior.departamento_id is distinct from departamento) then
  raise exception 'No puede cambiar su propio rol, actividad o ámbito' using errcode='42501';
 end if;
 if existe then
  update public.perfiles set nombre_completo=btrim(p_nombre),cargo=nullif(btrim(p_cargo),''),rol_id=rol,unidad_id=p_unidad,division_id=division,departamento_id=departamento,activo=p_activo,updated_at=now() where id=p_perfil;
 else
  insert into public.perfiles(id,nombre_completo,cargo,rol_id,unidad_id,division_id,departamento_id,activo)
  values(p_perfil,btrim(p_nombre),nullif(btrim(p_cargo),''),rol,p_unidad,division,departamento,p_activo);
 end if;
end $$;

-- Registro de auditoría append-only para el navegador. No guarda nombres,
-- correos, motivos, diagnósticos, contraseñas ni snapshots completos de filas.
create function private.rb_auditar_cambio()
returns trigger language plpgsql security definer set search_path='' as $$
declare viejo jsonb; nuevo jsonb; fila jsonb; unidad bigint; datos jsonb; campos jsonb;
begin
 viejo:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 nuevo:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 fila:=case when tg_op='DELETE' then viejo else nuevo end;
 unidad:=coalesce((fila->>'unidad_id')::bigint,(fila->>'unidad_origen_id')::bigint);
 if unidad is null and fila ? 'semoviente_id' then
  select s.unidad_id into unidad from public.semovientes s where s.id=(fila->>'semoviente_id')::bigint;
 end if;
 select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into campos
 from jsonb_object_keys(viejo||nuevo) k where viejo->k is distinct from nuevo->k;
 datos:=jsonb_strip_nulls(jsonb_build_object(
  'campos_modificados',campos,'semoviente_id',fila->'semoviente_id',
  'unidad_origen_id',fila->'unidad_origen_id','unidad_destino_id',fila->'unidad_destino_id',
  'division_id',fila->'division_id','departamento_id',fila->'departamento_id',
  'estado_anterior',viejo->'estado','estado_nuevo',nuevo->'estado'
 ));
 insert into public.rb_auditoria(actor_id,unidad_id,tabla,registro_id,accion,detalle)
 values(auth.uid(),unidad,tg_table_name,fila->>'id',tg_op,datos);
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.rb_auditar_cambio() from public,anon,authenticated;
DO $$
declare t text;
begin
 foreach t in array array['semovientes','controles_sanitarios','controles_reproductivos','solicitudes_movimientos','rb_bajas','rb_evaluaciones_descarte','perfiles'] loop
  execute format('create trigger rb_auditar_cambios after insert or update or delete on public.%I for each row execute function private.rb_auditar_cambio()',t);
 end loop;
end $$;
revoke all on function public.rb_registrar_baja(bigint,text,date,text,jsonb),public.rb_evaluar_descarte(bigint,date,text,text),public.rb_listar_usuarios(),public.rb_guardar_perfil(uuid,text,text,text,bigint,boolean) from public,anon;
grant execute on function public.rb_registrar_baja(bigint,text,date,text,jsonb),public.rb_evaluar_descarte(bigint,date,text,text),public.rb_listar_usuarios(),public.rb_guardar_perfil(uuid,text,text,text,bigint,boolean) to authenticated;
commit;
