-- Instalación nueva: mismo contrato de solicitudes_movimientos que la base existente.
begin;
create table public.solicitudes_movimientos (
 id bigint generated always as identity primary key,
 semoviente_id bigint not null references public.semovientes(id),
 unidad_origen_id bigint not null references public.unidades_operativas(id),
 unidad_destino_id bigint not null references public.unidades_operativas(id),
 fecha_prevista date not null,
 motivo text not null check(length(btrim(motivo)) >= 10),
 solicitado_por uuid not null references auth.users(id),
 referencia_autorizacion text,
 estado varchar not null default 'pendiente' check(estado in ('pendiente','aprobado','rechazado','ejecutado','cancelado')),
 autorizado_por uuid references auth.users(id),
 fecha_autorizacion timestamptz,
 fecha_ejecucion timestamptz,
 observaciones text,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 fundamento_decision text,
 referencia_decision text,
 ejecutado_por uuid references auth.users(id),
 check(unidad_origen_id<>unidad_destino_id),
 check(autorizado_por is null or autorizado_por<>solicitado_por),
 check(estado not in ('aprobado','ejecutado','rechazado') or (autorizado_por is not null and fecha_autorizacion is not null)),
 check(estado<>'ejecutado' or fecha_ejecucion is not null)
);
-- La instalación nueva mantiene departamento_id directo en las unidades.
create function private.rb_rol_actual() returns text language sql stable security definer set search_path='' as $$
 select private.rol_actual()
$$;
create function private.rb_unidad_actual() returns bigint language sql stable security definer set search_path='' as $$
 select private.unidad_actual()
$$;
create function private.rb_puede_consultar_unidad(p_unidad bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.perfiles p
  join public.roles_sistema r on r.id=p.rol_id
  join public.unidades_operativas u on u.id=p_unidad
  where p.id=auth.uid() and p.activo and u.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')
   and ((r.codigo in ('SUP_DEPTO_VII','JEFE_DIV_B') and p.departamento_id=u.departamento_id)
    or (r.codigo='RESP_UNIDAD' and p.unidad_id=u.id))
 )
$$;
revoke all on function private.rb_rol_actual(),private.rb_unidad_actual(),private.rb_puede_consultar_unidad(bigint) from public,anon;
grant execute on function private.rb_rol_actual(),private.rb_unidad_actual(),private.rb_puede_consultar_unidad(bigint) to authenticated;
alter table public.solicitudes_movimientos enable row level security;
revoke all on public.solicitudes_movimientos from public,anon,authenticated;
grant select on public.solicitudes_movimientos to authenticated;
create policy solicitudes_movimientos_lectura on public.solicitudes_movimientos for select to authenticated using (
 (private.rb_rol_actual() in ('SUP_DEPTO_VII','JEFE_DIV_B')
  and private.rb_puede_consultar_unidad(unidad_origen_id)
  and private.rb_puede_consultar_unidad(unidad_destino_id))
 or (private.rb_rol_actual()='RESP_UNIDAD' and private.rb_unidad_actual() in (unidad_origen_id,unidad_destino_id))
);
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
  select 1 from public.unidades_operativas o join public.unidades_operativas d on d.departamento_id=o.departamento_id
  where o.id=a.unidad_id and d.id=p_destino and d.codigo in ('RIO-BLANCO','TAMARINERO','MAMORE')
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
 if not exists(select 1 from public.unidades_operativas o join public.unidades_operativas d on d.departamento_id=o.departamento_id
   where o.id=m.unidad_origen_id and d.id=m.unidad_destino_id and o.id<>d.id
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
 if not exists(select 1 from public.unidades_operativas o join public.unidades_operativas d on d.departamento_id=o.departamento_id
   where o.id=m.unidad_origen_id and d.id=m.unidad_destino_id and o.id<>d.id
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
commit;
